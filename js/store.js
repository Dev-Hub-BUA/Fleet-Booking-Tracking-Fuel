(function () {
  'use strict';

  const STORAGE_KEY = 'cira_fleet_live_store_v3';

  /**
   * Canonical Booking Schema
   *
   * @typedef {Object} RequesterInfo
   * @property {string} id - Requester user ID (e.g. "USR-REQ-101")
   * @property {string} name - Requester full name (e.g. "Demo Requester 1")
   * @property {string} department - Requester institutional department (e.g. "Faculty of Pharmacy")
   *
   * @typedef {Object} ItineraryPoint
   * @property {number} sequence - 1-based order in the journey
   * @property {'departure'|'stop'|'return'} type - Point classification
   * @property {string} place_name - Display place name
   * @property {number|null} lat - Latitude (6 decimal places)
   * @property {number|null} lng - Longitude (6 decimal places)
   * @property {boolean} pinned - True if user placed/confirmed on map
   * @property {boolean} approx - True if geocoded or approximate fallback
   * @property {string|null} arrive_at - ISO 8601 with +03:00 (null for departure)
   * @property {string|null} depart_at - ISO 8601 with +03:00 (null for return, or last point in one-way)
   * @property {string} notes - Instructions, contact person, gate, cargo
   *
   * @typedef {Object} RouteLeg
   * @property {number} from_seq - Starting point sequence number
   * @property {number} to_seq - Ending point sequence number
   * @property {number} distance_km - Leg driving distance in kilometers
   * @property {number} drive_minutes - Leg driving duration in minutes
   * @property {'route'|'est'} source - Source of road geometry/metrics
   *
   * @typedef {Object} DeadheadLeg
   * @property {number} from_seq - Starting point sequence number (last point)
   * @property {string} to_place - Vehicle base location name
   * @property {number} distance_km - Distance back to base
   * @property {number} drive_minutes - Drive time back to base
   *
   * @typedef {Object} CargoFlags
   * @property {boolean} fragile - Fragile handling required
   * @property {boolean} strap - Tie-down straps required
   * @property {boolean} loading_help - Ground crew loading help required
   *
   * @typedef {Object} VehicleAssignment
   * @property {string} vehicle_id - Vehicle code (e.g. "V-122", "V-125")
   * @property {string[]} driver_ids - Assigned driver IDs (e.g. ["D-101"])
   * @property {string} approved_by - Approver name and title
   * @property {string} approved_at - ISO 8601 with +03:00
   *
   * @typedef {Object} HoldWindow
   * @property {string} start - ISO 8601 with +03:00
   * @property {string} end - ISO 8601 with +03:00 (includes 45 min buffer and deadhead for one-way)
   * @property {number} buffer_minutes - Buffer minutes (default 45)
   *
   * @typedef {Object} BookingEstimate
   * @property {'fleet_average'|'vehicle'} basis - Calculation basis
   * @property {number} fuel_liters - Estimated fuel in liters
   * @property {number} cost_egp - Estimated fuel cost in EGP
   * @property {string} price_book_version - Price book version string
   *
   * @typedef {Object} BookingHistoryEntry
   * @property {string} status - Booking status at this milestone
   * @property {string} at - ISO 8601 with +03:00
   * @property {string} by - Acting user name and title
   * @property {string} note - Action description or dispatcher note
   *
   * @typedef {Object} BookingMessage
   * @property {'requester'|'dispatcher'|'system'} sender - Message sender role
   * @property {string} senderName - Display sender name
   * @property {string} time - ISO 8601 with +03:00
   * @property {string} text - Message body
   *
   * @typedef {Object} Booking
   * @property {string} id - Unique booking identifier (e.g. "BK-2047")
   * @property {'Pending'|'Approved'|'Changes requested'|'Rejected'|'Dispatched'|'Active'|'Closed'|'Completed'} status
   * @property {RequesterInfo} requester
   * @property {string} cost_center - Cost center code from requester's department
   * @property {string} start_date - Trip start date (YYYY-MM-DD)
   * @property {string} end_date - Trip end date (YYYY-MM-DD)
   * @property {boolean} return_with_vehicle - True if round-trip, false if one-way
   * @property {ItineraryPoint[]} itinerary - Ordered list of waypoints
   * @property {RouteLeg[]} route_legs - Driving legs between waypoints
   * @property {DeadheadLeg|null} deadhead - Automatic return leg to vehicle base for one-way trips
   * @property {number} passengers - Passenger count
   * @property {boolean} has_extra_cargo - Cargo flag
   * @property {number} cargo_kg - Cargo weight in kg
   * @property {string} cargo_description - Cargo description
   * @property {CargoFlags} cargo_flags - Cargo handling requirements
   * @property {string} driver_overnight_location - Accommodation details for multi-day trips
   * @property {string} notes_for_dispatch - Requester notes for logistics team
   * @property {VehicleAssignment|null} assignment - Resource assignment details
   * @property {HoldWindow} hold_window - Total reserved vehicle window
   * @property {BookingEstimate} estimate - Fuel and cost estimation
   * @property {BookingHistoryEntry[]} history - Audit history log
   * @property {BookingMessage[]} messages - Requester-dispatcher communication
   */

  const DEFAULT_SETTINGS = {
    system: {
      organization: 'CIRA Education',
      portalName: 'Fleet Logistics & Dispatch Platform',
      version: '3.3.0',
      timezone: 'Africa/Cairo',
      currency: 'EGP'
    },
    rules: {
      bookingLeadTimeHours: 4,
      selfCancelWindowHours: 2,
      prepBufferMin: 30,
      turnaroundBufferMin: 45,
      maxDrivingHoursPerDay: 8.0,
      fuelVarianceThresholdPct: 10.0,
      agingThresholdHours: 4,
      staleSignalThresholdMin: 5,
      maxIdleMinutesAlert: 15,
      fleetAverageRatePer100Km: 10.0,
      returnMatch: {
        maxPickupDistanceKm: 15,
        maxWaitHours: 3,
        maxDetourMinutes: 30
      }
    },
    contacts: {
      office: 'CIRA Central Logistics Directorate, Campus Admin Bldg, G-14',
      dispatchDesk: 'Ext. 0000',
      emergencyHotline: '+20 000 000 0000',
      email: 'operations@example.com',
      hours: '24/7 Operations Command & Dispatch'
    },
    fuelPrices: {
      activeVersion: 'Effective 10 Mar 2026',
      rates: {
        diesel: 20.50,
        petrol92: 22.25,
        petrol95: 24.00,
        cng: 13.00
      }
    }
  };

  const PRICE_BOOKS = [
    {
      version: 'Effective 10 Mar 2026',
      effectiveDate: '2026-03-10',
      rates: {
        diesel: 20.50,
        petrol92: 22.25,
        petrol95: 24.00,
        cng: 13.00
      }
    },
    {
      version: 'v3 (Effective 01 Jan 2026)',
      effectiveDate: '2026-01-01',
      rates: {
        diesel: 19.50,
        petrol92: 21.00,
        petrol95: 22.50,
        cng: 11.50
      }
    }
  ];

  const DEFAULT_DEPARTMENTS = [
    { name: 'Faculty of Pharmacy', costCenter: 'CC-410 (Faculty of Pharmacy)' },
    { name: 'Faculty of Engineering', costCenter: 'CC-220 (Faculty of Engineering)' },
    { name: 'Faculty of Science', costCenter: 'CC-330 (Faculty of Science)' },
    { name: 'Faculty of Oral & Dental Medicine', costCenter: 'CC-510 (Faculty of Oral & Dental Medicine)' },
    { name: 'General Administration', costCenter: 'CC-100 (General Administration)' },
    { name: 'Logistics Command Desk', costCenter: 'CC-800 (Logistics Command Desk)' },
    { name: 'Fleet Operations Directorate', costCenter: 'CC-900 (Fleet Operations Directorate)' },
    { name: 'Financial Compliance Bureau', costCenter: 'CC-700 (Financial Compliance Bureau)' },
    { name: 'Central Transport Pool', costCenter: 'CC-850 (Central Transport Pool)' }
  ];

  const KNOWN_LOCATIONS = [
    { name: 'Badr University in Assiut', lat: 27.1809, lng: 31.1837, type: 'Campus' },
    { name: 'Cairo University', lat: 30.0276, lng: 31.2089, type: 'Academic' },
    { name: 'Badr University in Cairo', lat: 30.1378, lng: 31.7456, type: 'Campus' },
    { name: 'Ain Shams University', lat: 30.0771, lng: 31.2853, type: 'Academic' },
    { name: 'Supplier Depot — Obour City', lat: 30.2241, lng: 31.4589, type: 'Logistics' },
    { name: 'Plant 3 — 10th of Ramadan', lat: 30.3012, lng: 31.7432, type: 'Industrial' },
    { name: 'Ain Sokhna Marine Research Facility', lat: 29.6012, lng: 32.3211, type: 'Research' },
    { name: 'Alexandria University / Borg El Arab', lat: 31.2001, lng: 29.9187, type: 'Campus' },
    { name: 'Tanta University', lat: 30.7960, lng: 31.0004, type: 'Academic' },
    { name: 'Cairo International Airport T3', lat: 30.1114, lng: 31.4065, type: 'Transit' },
    { name: 'Alexandria', lat: 31.2001, lng: 29.9187, type: 'Campus' },
    { name: 'Tanta', lat: 30.7960, lng: 31.0004, type: 'Academic' },
    { name: 'Cairo', lat: 30.0276, lng: 31.2089, type: 'Academic' }
  ];

  const KNOWN_DISTANCES = {
    'Badr University in Assiut|Cairo University': { km: 380, mins: 310 },
    'Cairo University|Badr University in Assiut': { km: 380, mins: 310 },
    'Cairo University|Badr University in Cairo': { km: 58, mins: 48 },
    'Badr University in Cairo|Cairo University': { km: 58, mins: 48 },
    'Badr University in Cairo|Badr University in Assiut': { km: 420, mins: 320 },
    'Badr University in Assiut|Badr University in Cairo': { km: 420, mins: 320 },
    'Badr University in Assiut|Alexandria University / Borg El Arab': { km: 598, mins: 550 },
    'Alexandria University / Borg El Arab|Badr University in Assiut': { km: 598, mins: 550 },
    'Badr University in Cairo|Supplier Depot — Obour City': { km: 32, mins: 35 },
    'Supplier Depot — Obour City|Badr University in Cairo': { km: 32, mins: 35 },
    'Supplier Depot — Obour City|Plant 3 — 10th of Ramadan': { km: 29.4, mins: 30 },
    'Plant 3 — 10th of Ramadan|Supplier Depot — Obour City': { km: 29.4, mins: 30 },
    'Plant 3 — 10th of Ramadan|Badr University in Cairo': { km: 38, mins: 35 },
    'Badr University in Cairo|Plant 3 — 10th of Ramadan': { km: 38, mins: 35 },
    'Badr University in Cairo|Cairo International Airport T3': { km: 42, mins: 45 },
    'Cairo International Airport T3|Badr University in Cairo': { km: 42, mins: 45 },
    'Badr University in Cairo|Ain Sokhna Marine Research Facility': { km: 110, mins: 85 },
    'Ain Sokhna Marine Research Facility|Badr University in Cairo': { km: 110, mins: 85 },
    'Cairo University|Alexandria University / Borg El Arab': { km: 218, mins: 160 },
    'Alexandria University / Borg El Arab|Cairo University': { km: 218, mins: 160 },
    'Alexandria University / Borg El Arab|Tanta University': { km: 130, mins: 105 },
    'Tanta University|Alexandria University / Borg El Arab': { km: 130, mins: 105 },
    'Tanta University|Cairo University': { km: 95, mins: 80 },
    'Cairo University|Tanta University': { km: 95, mins: 80 },
    'Alexandria|Tanta': { km: 130, mins: 105 },
    'Tanta|Alexandria': { km: 130, mins: 105 },
    'Tanta|Cairo': { km: 95, mins: 80 },
    'Cairo|Tanta': { km: 95, mins: 80 },
    'Alexandria|Cairo': { km: 218, mins: 160 },
    'Cairo|Alexandria': { km: 218, mins: 160 }
  };

  const CONSUMPTION_RATES = {
    'Passenger Van': { ratePer100Km: 10.0, fuelPrice: 20.50, fuelType: 'Diesel' },
    'Sedan': { ratePer100Km: 7.0, fuelPrice: 22.25, fuelType: 'Petrol 92' },
    'Bus': { ratePer100Km: 26.0, fuelPrice: 20.50, fuelType: 'Diesel' },
    'Heavy Cargo Truck': { ratePer100Km: 18.0, fuelPrice: 20.50, fuelType: 'Diesel' }
  };

  const CIRA_INSTITUTIONS = [
    'Badr University in Assiut (BUA)',
    'Badr University in Cairo (BUC)',
    'CIRA Alexandria Campus',
    'Saxony Egypt University (SISU)',
    'CIRA Central Logistics Directorate',
    'Futures Educational Systems',
    'Regent British School'
  ];

  const DEFAULT_SITES = [
    {
      id: 'SITE-BUA',
      name: 'Badr University in Assiut',
      institution: 'Badr University in Assiut (BUA)',
      city: 'Assiut',
      address: 'Assiut-Sohag Western Desert Road, Assiut',
      lat: 27.1809,
      lng: 31.1837,
      pinned: false,
      to_verify: true,
      active: true
    },
    {
      id: 'SITE-BUC',
      name: 'Badr University in Cairo (Badr City)',
      institution: 'Badr University in Cairo (BUC)',
      city: 'Cairo',
      address: 'Entertainment Area, Badr City, Cairo',
      lat: 30.1378,
      lng: 31.7456,
      pinned: false,
      to_verify: true,
      active: true
    },
    {
      id: 'SITE-ALEX',
      name: 'Alexandria Branch (Borg El Arab)',
      institution: 'CIRA Alexandria Campus',
      city: 'Alexandria',
      address: 'Universities District, New Borg El Arab City, Alexandria',
      lat: 31.2001,
      lng: 29.9187,
      pinned: false,
      to_verify: true,
      active: true
    },
    {
      id: 'SITE-HQ',
      name: 'CIRA Central Headquarters',
      institution: 'CIRA Central Logistics Directorate',
      city: 'Cairo',
      address: 'Campus Administration Building, G-14, Nasr City, Cairo',
      lat: 30.0561,
      lng: 31.3301,
      pinned: false,
      to_verify: true,
      active: true
    }
  ];

  const DEFAULT_VEHICLES = [
    { code: 'V-122', plate: 'BDR 3307', model: 'Toyota HiAce', year: 2023, category: 'Passenger Van', type: 'Van', seats: 9, payloadKg: 1000, fuelType: 'Diesel', ratePer100Km: 10.0, status: 'Available', location: 'Badr University in Assiut', home_site_id: 'SITE-BUA', odo: 48276 },
    { code: 'V-130', plate: 'BDR 4182', model: 'Toyota HiAce', year: 2020, category: 'Passenger Van', type: 'Van', seats: 12, payloadKg: 1200, fuelType: 'Diesel', ratePer100Km: 10.5, status: 'Available', location: 'Badr University in Cairo', home_site_id: 'SITE-BUC', odo: 84150 },
    { code: 'V-125', plate: 'BDR 8102', model: 'Toyota HiAce', year: 2023, category: 'Passenger Van', type: 'Van', seats: 12, payloadKg: 1100, fuelType: 'Diesel', ratePer100Km: 10.0, status: 'Available', location: 'Alexandria University / Borg El Arab', home_site_id: 'SITE-ALEX', odo: 38200 },
    { code: 'S-14', plate: 'BDR 4591', model: 'Hyundai Elantra', year: 2024, category: 'Sedan', type: 'Sedan', seats: 4, payloadKg: 400, fuelType: 'Petrol 92', ratePer100Km: 7.0, status: 'Available', location: 'Alexandria University / Borg El Arab', home_site_id: 'SITE-ALEX', odo: 21500 },
    { code: 'V-114', plate: 'BDR 2019', model: 'Toyota HiAce', year: 2022, category: 'Passenger Van', type: 'Van', seats: 9, payloadKg: 1100, fuelType: 'Diesel', ratePer100Km: 9.8, status: 'On trip', location: 'Transit to Obour', home_site_id: 'SITE-BUC', odo: 62400 },
    { code: 'S-11', plate: 'BDR 1044', model: 'Hyundai Elantra', year: 2024, category: 'Sedan', type: 'Sedan', seats: 4, payloadKg: 400, fuelType: 'Petrol 92', ratePer100Km: 7.1, status: 'Available', location: 'Badr University in Assiut', home_site_id: 'SITE-BUA', odo: 18300 },
    { code: 'V-205', plate: 'BDR 5580', model: 'Toyota Corolla', year: 2023, category: 'Sedan', type: 'Sedan', seats: 4, payloadKg: 400, fuelType: 'Petrol 95', ratePer100Km: 6.8, status: 'On trip', location: 'Cairo Airport T3', home_site_id: 'SITE-HQ', odo: 32100 },
    { code: 'C-04', plate: 'BDR 7712', model: 'Hyundai Accent', year: 2022, category: 'Sedan', type: 'Sedan', seats: 4, payloadKg: 400, fuelType: 'CNG', ratePer100Km: 7.4, status: 'Available', location: 'Cairo University', home_site_id: 'SITE-HQ', odo: 51900 },
    { code: 'B-07', plate: 'BDR 9901', model: 'MCV 500 Coach', year: 2021, category: 'Bus', type: 'Bus', seats: 45, payloadKg: 4000, fuelType: 'Diesel', ratePer100Km: 27.5, status: 'Available', location: 'Badr University in Cairo', home_site_id: 'SITE-BUC', odo: 112000 },
    { code: 'T-02', plate: 'BDR 6623', model: 'Isuzu NPR Box Truck', year: 2021, category: 'Heavy Cargo Truck', type: 'Truck', seats: 3, payloadKg: 4500, fuelType: 'Diesel', ratePer100Km: 18.0, status: 'On trip', location: 'Plant 3 — 10th of Ramadan', home_site_id: 'SITE-BUC', odo: 95800 },
    { code: 'V-108', plate: 'BDR 1198', model: 'Nissan Urvan', year: 2019, category: 'Passenger Van', type: 'Van', seats: 12, payloadKg: 1150, fuelType: 'Diesel', ratePer100Km: 10.4, status: 'Maintenance', location: 'Central Workshop', home_site_id: 'SITE-HQ', odo: 143200 }
  ];

  const DEFAULT_DRIVERS = [
    { id: 'D-101', name: 'Demo Driver 01', home_site_id: 'SITE-BUA', licenseClass: 'Class 2 (Professional 2nd)', licenseNo: 'LIC-DEMO-0001', expires: '2028-03-15', status: 'Available', totalTrips: 412, allowedVehicles: ['Sedan', 'Van', 'Minibus'], phone: '+20 000 000 0000', email: 'demo.driver01@example.com' },
    { id: 'D-102', name: 'Demo Driver 02', home_site_id: 'SITE-BUC', licenseClass: 'Class 2 (Professional 2nd)', licenseNo: 'LIC-DEMO-0002', expires: '2027-11-20', status: 'Available', totalTrips: 345, allowedVehicles: ['Sedan', 'Van', 'Minibus'], phone: '+20 000 000 0000', email: 'demo.driver02@example.com' },
    { id: 'D-103', name: 'Demo Driver 03', home_site_id: 'SITE-BUC', licenseClass: 'Class 2 (Professional 2nd)', licenseNo: 'LIC-DEMO-0003', expires: '2027-08-10', status: 'Available', totalTrips: 520, allowedVehicles: ['Sedan', 'Van', 'Minibus'], phone: '+20 000 000 0000', email: 'demo.driver03@example.com' },
    { id: 'D-104', name: 'Demo Driver 04', home_site_id: 'SITE-BUC', licenseClass: 'Class 2 (Professional 2nd)', licenseNo: 'LIC-DEMO-0004', expires: '2026-09-15', status: 'Off Duty (Expired)', totalTrips: 288, allowedVehicles: ['Sedan', 'Van'], phone: '+20 000 000 0000', email: 'demo.driver04@example.com' },
    { id: 'D-105', name: 'Demo Driver 05', home_site_id: 'SITE-BUA', licenseClass: 'Class 3 (Private)', licenseNo: 'LIC-DEMO-0005', expires: '2029-01-18', status: 'Available', totalTrips: 180, allowedVehicles: ['Sedan only'], phone: '+20 000 000 0000', email: 'demo.driver05@example.com' },
    { id: 'D-106', name: 'Demo Driver 06', home_site_id: 'SITE-HQ', licenseClass: 'Class 2 (Professional 2nd)', licenseNo: 'LIC-DEMO-0006', expires: '2027-05-30', status: 'Available', totalTrips: 390, allowedVehicles: ['Sedan', 'Van', 'Minibus'], phone: '+20 000 000 0000', email: 'demo.driver06@example.com' },
    { id: 'D-107', name: 'Demo Driver 07', home_site_id: 'SITE-ALEX', licenseClass: 'Class 2 (Professional 2nd)', licenseNo: 'LIC-DEMO-0007', expires: '2028-09-12', status: 'Available', totalTrips: 210, allowedVehicles: ['Sedan', 'Van', 'CNG'], phone: '+20 000 000 0000', email: 'demo.driver07@example.com' },
    { id: 'D-108', name: 'Demo Driver 08', home_site_id: 'SITE-BUC', licenseClass: 'Class 1 (Professional 1st)', licenseNo: 'LIC-DEMO-0008', expires: '2027-12-05', status: 'Available', totalTrips: 640, allowedVehicles: ['Bus', 'Heavy Coach', 'Van', 'Sedan'], phone: '+20 000 000 0000', email: 'demo.driver08@example.com' },
    { id: 'D-109', name: 'Demo Driver 09', home_site_id: 'SITE-BUC', licenseClass: 'Class 1 (Professional 1st)', licenseNo: 'LIC-DEMO-0009', expires: '2028-04-22', status: 'Available', totalTrips: 480, allowedVehicles: ['Truck', 'Van', 'Heavy Cargo'], phone: '+20 000 000 0000', email: 'demo.driver09@example.com' },
    { id: 'D-110', name: 'Demo Driver 10', home_site_id: 'SITE-BUC', licenseClass: 'Class 1 (Professional 1st)', licenseNo: 'LIC-DEMO-0010', expires: '2028-07-14', status: 'Suspended: Incident Triage', totalTrips: 310, allowedVehicles: ['Bus', 'Van'], phone: '+20 000 000 0000', email: 'demo.driver10@example.com' },
    { id: 'D-111', name: 'Demo Driver 11', home_site_id: 'SITE-BUA', licenseClass: 'Class 2 (Professional 2nd)', licenseNo: 'LIC-DEMO-0011', expires: '2028-10-10', status: 'Available', totalTrips: 150, allowedVehicles: ['Sedan', 'Van'], phone: '+20 000 000 0000', email: 'demo.driver11@example.com' },
    { id: 'D-112', name: 'Demo Driver 12', home_site_id: 'SITE-ALEX', licenseClass: 'Class 2 (Professional 2nd)', licenseNo: 'LIC-DEMO-0012', expires: '2029-04-01', status: 'Available', totalTrips: 195, allowedVehicles: ['Sedan', 'Van'], phone: '+20 000 000 0000', email: 'demo.driver12@example.com' }
  ];

  function toEgyptISOString(date) {
    if (!(date instanceof Date) || isNaN(date.getTime())) {
      date = new Date();
    }
    const egyptOffsetMs = 3 * 60 * 60 * 1000;
    const egyptTime = new Date(date.getTime() + egyptOffsetMs);
    const y = egyptTime.getUTCFullYear();
    const m = String(egyptTime.getUTCMonth() + 1).padStart(2, '0');
    const d = String(egyptTime.getUTCDate()).padStart(2, '0');
    const hh = String(egyptTime.getUTCHours()).padStart(2, '0');
    const mm = String(egyptTime.getUTCMinutes()).padStart(2, '0');
    const ss = String(egyptTime.getUTCSeconds()).padStart(2, '0');
    return `${y}-${m}-${d}T${hh}:${mm}:${ss}+03:00`;
  }

  function formatEgyptISO(val, fallbackTime = '08:00') {
    if (!val) return null;
    if (typeof val === 'string') {
      const trimmed = val.trim();
      if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2})?(\+03:00)$/.test(trimmed)) {
        return trimmed;
      }
      if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2})?([+-]\d{2}:\d{2}|Z)$/.test(trimmed)) {
        return toEgyptISOString(new Date(trimmed));
      }
      const m = trimmed.match(/^(\d{4}-\d{2}-\d{2})(?:[ T](\d{2}:\d{2})(?::(\d{2}))?)?/);
      if (m) {
        const d = m[1];
        const t = m[2] || fallbackTime;
        const s = m[3] || '00';
        return `${d}T${t}:${s}+03:00`;
      }
      const parsed = new Date(trimmed);
      if (!isNaN(parsed.getTime())) {
        return toEgyptISOString(parsed);
      }
    }
    if (val instanceof Date && !isNaN(val.getTime())) {
      return toEgyptISOString(val);
    }
    return null;
  }

  function calculateHaversineKm(lat1, lon1, lat2, lon2) {
    const R = 6371;
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
              Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
              Math.sin(dLon / 2) * Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return Math.round(R * c * 1.28 * 10) / 10;
  }

  function findLocationByName(query) {
    if (!query) return null;
    const clean = query.trim().toLowerCase();
    return KNOWN_LOCATIONS.find(loc => {
      const name = loc.name.toLowerCase();
      return name === clean || name.includes(clean) || clean.includes(name);
    }) || null;
  }

  function formatShortDate(dateStr) {
    if (!dateStr) return '';
    const clean = dateStr.includes(' ') ? dateStr.split(' ')[0] : (dateStr.includes('T') ? dateStr.split('T')[0] : dateStr);
    const d = new Date(clean + 'T12:00:00+03:00');
    if (isNaN(d.getTime())) return dateStr;
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    return `${d.getUTCDate()} ${months[d.getUTCMonth()]}`;
  }

  function formatShortRange(startStr, endStr) {
    if (!startStr) return '';
    const s = formatShortDate(startStr);
    const e = formatShortDate(endStr);
    if (!e || s === e) return s;
    const sParts = s.split(' ');
    const eParts = e.split(' ');
    if (sParts[1] === eParts[1]) {
      return `${sParts[0]}–${eParts[0]} ${sParts[1]}`;
    }
    return `${s}–${e}`;
  }

  function parseDateTimeSafe(str, fallbackTime = '08:00') {
    if (!str) return new Date();
    const iso = formatEgyptISO(str, fallbackTime);
    const d = new Date(iso);
    return isNaN(d.getTime()) ? new Date() : d;
  }

  function getPriceBookForDate(dateStr) {
    const target = dateStr ? dateStr.split('T')[0] : '2026-10-18';
    for (const pb of PRICE_BOOKS) {
      if (target >= pb.effectiveDate) {
        return pb;
      }
    }
    return PRICE_BOOKS[0];
  }

  function getCostCenterForDepartment(deptName) {
    if (!deptName) return 'CC-100 (General Administration)';
    const clean = deptName.trim().toLowerCase();
    const match = DEFAULT_DEPARTMENTS.find(d => d.name.toLowerCase() === clean || clean.includes(d.name.toLowerCase()));
    if (match) return match.costCenter;
    return `CC-${clean.replace(/[^a-z0-9]/g, '').slice(0, 3).toUpperCase() || '400'} (${deptName})`;
  }

  function getNextNumericId(bookings) {
    let maxNum = 2050;
    if (Array.isArray(bookings)) {
      for (const b of bookings) {
        if (b && b.id) {
          const match = String(b.id).match(/^BK-(\d+)$/i);
          if (match) {
            const num = parseInt(match[1], 10);
            if (!isNaN(num) && num > maxNum) {
              maxNum = num;
            }
          }
        }
      }
    }
    return maxNum + 1;
  }

  function calculateDeadheadLeg(lastPoint, vehicleBase) {
    if (!lastPoint) return null;
    const basePlace = (typeof vehicleBase === 'string')
      ? vehicleBase
      : ((vehicleBase && vehicleBase.location) ? vehicleBase.location : 'Badr University in Assiut');

    const fromName = (lastPoint.place_name || lastPoint.name || 'Last Stop').trim();
    const leg = RouteEstimator.estimateLeg(lastPoint, { place_name: basePlace }, 'Passenger Van');

    return {
      from_seq: Number(lastPoint.sequence || 1),
      to_place: basePlace,
      distance_km: leg.distance_km,
      drive_minutes: leg.drive_minutes
    };
  }

  function calculateOvernightNights(booking) {
    if (!booking) return 0;
    const itinerary = Array.isArray(booking.itinerary) ? booking.itinerary : [];
    if (itinerary.length === 0) {
      const s = booking.start_date;
      const e = booking.end_date;
      if (!s || !e) return 0;
      const d1 = new Date(s + 'T00:00:00+03:00');
      const d2 = new Date(e + 'T00:00:00+03:00');
      return Math.max(0, Math.round((d2.getTime() - d1.getTime()) / 86400000));
    }

    const firstPt = itinerary[0];
    const lastPt = itinerary[itinerary.length - 1];

    const depStr = firstPt.depart_at || `${booking.start_date || '2026-10-18'}T08:00:00+03:00`;
    const depDate = new Date(depStr);

    let backDate;
    if (booking.return_with_vehicle) {
      const arrStr = lastPt.arrive_at || `${booking.end_date || '2026-10-18'}T18:00:00+03:00`;
      backDate = new Date(arrStr);
    } else {
      const arrStr = lastPt.arrive_at || `${booking.end_date || '2026-10-18'}T18:00:00+03:00`;
      const arrMs = new Date(arrStr).getTime();
      const deadheadMins = (booking.deadhead && booking.deadhead.drive_minutes) ? booking.deadhead.drive_minutes : 0;
      backDate = new Date(arrMs + deadheadMins * 60000);
    }

    if (isNaN(depDate.getTime()) || isNaN(backDate.getTime())) return 0;

    const depIso = toEgyptISOString(depDate);
    const backIso = toEgyptISOString(backDate);
    const depCalendar = depIso.split('T')[0];
    const backCalendar = backIso.split('T')[0];

    const d1 = new Date(depCalendar + 'T00:00:00Z');
    const d2 = new Date(backCalendar + 'T00:00:00Z');
    const diffDays = Math.round((d2.getTime() - d1.getTime()) / 86400000);

    return Math.max(0, diffDays);
  }

  function calculateHoldWindow(booking, vehicleBase) {
    const bufferMin = 45;
    const itinerary = Array.isArray(booking.itinerary) && booking.itinerary.length >= 1 ? booking.itinerary : [];
    const firstPt = itinerary[0] || {};
    const lastPt = itinerary[itinerary.length - 1] || {};

    const startIso = formatEgyptISO(firstPt.depart_at || `${booking.start_date || '2026-10-18'} 08:00`);

    let endMs;
    if (booking.return_with_vehicle) {
      const endBaseIso = formatEgyptISO(lastPt.arrive_at || `${booking.end_date || '2026-10-22'} 18:00`);
      endMs = new Date(endBaseIso).getTime() + (bufferMin * 60000);
    } else {
      const lastArrIso = formatEgyptISO(lastPt.arrive_at || `${booking.end_date || '2026-10-22'} 18:00`);
      const deadhead = booking.deadhead || calculateDeadheadLeg(lastPt, vehicleBase || firstPt.place_name);
      const deadheadMins = deadhead ? deadhead.drive_minutes : 0;
      endMs = new Date(lastArrIso).getTime() + ((deadheadMins + bufferMin) * 60000);
    }

    const endIso = toEgyptISOString(new Date(endMs));
    return {
      start: startIso,
      end: endIso,
      buffer_minutes: bufferMin
    };
  }

  function calculateBookingEstimate(booking, assignedVehicle) {
    const priceBook = getPriceBookForDate(booking.start_date);
    const legs = Array.isArray(booking.route_legs) ? booking.route_legs : [];
    let routeDist = 0;
    legs.forEach(l => { routeDist += (l.distance_km || 0); });

    const deadheadDist = (booking.deadhead && booking.deadhead.distance_km) ? booking.deadhead.distance_km : 0;

    let repositioningKm = 0;
    if (assignedVehicle) {
      const vLoc = (assignedVehicle.location || '').toLowerCase();
      const firstPlace = (booking.itinerary && booking.itinerary[0] && booking.itinerary[0].place_name) || '';
      const dLoc = firstPlace.toLowerCase();
      if (vLoc && dLoc && !vLoc.includes(dLoc) && !dLoc.includes(vLoc)) {
        const vKnown = findLocationByName(assignedVehicle.location);
        const dKnown = findLocationByName(firstPlace);
        if (vKnown && dKnown) {
          const key = `${vKnown.name}|${dKnown.name}`;
          repositioningKm = KNOWN_DISTANCES[key] ? KNOWN_DISTANCES[key].km : calculateHaversineKm(vKnown.lat, vKnown.lng, dKnown.lat, dKnown.lng);
        }
      }
    }

    const totalKm = Math.round((routeDist + deadheadDist + repositioningKm) * 10) / 10;
    const cargoWeight = booking.has_extra_cargo ? (booking.cargo_kg || 0) : 0;
    const loadFactor = (cargoWeight > 200) ? (1.0 + Math.min(0.3, (cargoWeight / 1000) * 0.15)) : 1.0;

    if (assignedVehicle) {
      let fuelPrice = priceBook.rates.diesel;
      if (assignedVehicle.fuelType === 'Petrol 92') fuelPrice = priceBook.rates.petrol92;
      else if (assignedVehicle.fuelType === 'Petrol 95') fuelPrice = priceBook.rates.petrol95;
      else if (assignedVehicle.fuelType === 'CNG') fuelPrice = priceBook.rates.cng;

      const nominal = assignedVehicle.ratePer100Km || 10.0;
      const fuelLiters = Math.round((totalKm * (nominal / 100) * loadFactor) * 10) / 10;
      const costEGP = Math.round(fuelLiters * fuelPrice * 100) / 100;

      return {
        basis: 'vehicle',
        fuel_liters: fuelLiters,
        cost_egp: costEGP,
        price_book_version: priceBook.version
      };
    } else {
      const fleetAverageRate = 10.0;
      const fuelPrice = priceBook.rates.diesel;
      const fuelLiters = Math.round((totalKm * (fleetAverageRate / 100) * loadFactor) * 10) / 10;
      const costEGP = Math.round(fuelLiters * fuelPrice * 100) / 100;

      return {
        basis: 'fleet_average',
        fuel_liters: fuelLiters,
        cost_egp: costEGP,
        price_book_version: priceBook.version
      };
    }
  }

  const RouteEstimator = {
    locations: KNOWN_LOCATIONS,
    CONSUMPTION_RATES: CONSUMPTION_RATES,

    findLocation: findLocationByName,

    estimateLeg: function (fromPoint, toPoint, vehicleCategory, loadFactor = 1.0) {
      const fromName = (fromPoint.place_name || fromPoint.name || '').trim();
      const toName = (toPoint.place_name || toPoint.name || '').trim();

      let distanceKm = 0;
      let driveMinutes = 0;

      const directKey = `${fromName}|${toName}`;
      if (KNOWN_DISTANCES[directKey]) {
        distanceKm = KNOWN_DISTANCES[directKey].km;
        driveMinutes = KNOWN_DISTANCES[directKey].mins;
      } else {
        const fromLoc = findLocationByName(fromName);
        const toLoc = findLocationByName(toName);

        const lat1 = fromPoint.lat || (fromLoc ? fromLoc.lat : 30.0);
        const lng1 = fromPoint.lng || (fromLoc ? fromLoc.lng : 31.2);
        const lat2 = toPoint.lat || (toLoc ? toLoc.lat : 30.2);
        const lng2 = toPoint.lng || (toLoc ? toLoc.lng : 31.4);

        distanceKm = calculateHaversineKm(lat1, lng1, lat2, lng2);
        if (distanceKm < 15) distanceKm = 18.5;
        driveMinutes = Math.round((distanceKm / 70) * 60);
      }

      const catConfig = CONSUMPTION_RATES[vehicleCategory] || CONSUMPTION_RATES['Passenger Van'];
      const fuelLiters = Math.round((distanceKm * (catConfig.ratePer100Km / 100) * (loadFactor || 1.0)) * 10) / 10;
      const legCostEGP = Math.round(fuelLiters * catConfig.fuelPrice * 100) / 100;

      let plannedMinutes = null;
      let warning = null;

      const departIso = fromPoint.depart_at;
      const arriveIso = toPoint.arrive_at;

      if (departIso && arriveIso) {
        const depDate = new Date(departIso);
        const arrDate = new Date(arriveIso);
        const diffMs = arrDate.getTime() - depDate.getTime();
        if (!isNaN(diffMs) && diffMs > 0) {
          plannedMinutes = Math.round(diffMs / 60000);
          if (plannedMinutes < driveMinutes) {
            const planH = Math.floor(plannedMinutes / 60);
            const planM = plannedMinutes % 60;
            const driveH = Math.floor(driveMinutes / 60);
            const driveM = driveMinutes % 60;
            warning = `You planned ${planH}h ${planM.toString().padStart(2, '0')}m, driving needs about ${driveH}h ${driveM.toString().padStart(2, '0')}m (estimate)`;
          }
        }
      }

      return {
        from_seq: fromPoint.sequence,
        to_seq: toPoint.sequence,
        from_place: fromName,
        to_place: toName,
        distance_km: distanceKm,
        drive_minutes: driveMinutes,
        fuel_liters: fuelLiters,
        cost_egp: legCostEGP,
        planned_minutes: plannedMinutes,
        warning: warning
      };
    },

    computeItineraryLegs: function (points, vehicleCategory, loadFactor = 1.0) {
      if (!Array.isArray(points) || points.length < 2) return [];
      const legs = [];
      for (let i = 0; i < points.length - 1; i++) {
        const leg = this.estimateLeg(points[i], points[i + 1], vehicleCategory, loadFactor);
        legs.push({
          from_seq: points[i].sequence || (i + 1),
          to_seq: points[i + 1].sequence || (i + 2),
          distance_km: leg.distance_km,
          drive_minutes: leg.drive_minutes,
          source: 'est'
        });
      }
      return legs;
    },

    calculateDaysCount: function (startDateStr, endDateStr) {
      if (!startDateStr || !endDateStr) return 1;
      const d1 = new Date(startDateStr.split('T')[0] + 'T00:00:00+03:00');
      const d2 = new Date(endDateStr.split('T')[0] + 'T00:00:00+03:00');
      if (isNaN(d1.getTime()) || isNaN(d2.getTime()) || d2 < d1) return 1;
      const diffDays = Math.round((d2.getTime() - d1.getTime()) / 86400000) + 1;
      return Math.max(1, diffDays);
    },

    checkDriverRules: function (points, legs) {
      const dailyDriveMap = {};
      legs.forEach((leg, index) => {
        const fromPoint = points[index] || {};
        const rawDate = (fromPoint.depart_at || '').split('T')[0] || 'Unknown';
        dailyDriveMap[rawDate] = (dailyDriveMap[rawDate] || 0) + leg.drive_minutes;
      });

      const dayViolations = [];
      let dayIndex = 1;
      for (const [dateStr, totalMins] of Object.entries(dailyDriveMap)) {
        if (totalMins > 480) {
          const h = Math.floor(totalMins / 60);
          const m = totalMins % 60;
          dayViolations.push({
            date: dateStr,
            dayIndex: dayIndex,
            totalMins: totalMins,
            notice: `Day ${dayIndex} (${dateStr}) needs ${h}h ${m.toString().padStart(2, '0')}m of driving (estimate). Dispatch will assign a second driver or plan a rest stop.`
          });
        }
        dayIndex++;
      }

      return {
        dailyDriveMap: dailyDriveMap,
        dayViolations: dayViolations
      };
    }
  };

  function migrateBooking(raw, allVehicles = DEFAULT_VEHICLES, allDrivers = DEFAULT_DRIVERS) {
    if (!raw || typeof raw !== 'object') return null;

    const id = String(raw.id || 'BK-2050');
    const status = String(raw.status || 'Pending');

    let reqId = (raw.requester && raw.requester.id) || 'USR-REQ-101';
    let reqName = (raw.requester && raw.requester.name) || raw.requesterName || 'Demo Requester 1';
    let reqDept = (raw.requester && raw.requester.department) || raw.dept || 'Faculty of Pharmacy';

    if (reqId === 'USR-REQ-101' || reqName.includes('Requester 1')) {
      reqId = 'USR-REQ-101';
      reqName = 'Demo Requester 1';
      reqDept = 'Faculty of Pharmacy';
    } else if (reqId === 'USR-REQ-102' || reqName.includes('Requester 2')) {
      reqId = 'USR-REQ-102';
      reqName = 'Demo Requester 2';
      reqDept = 'Faculty of Physical Therapy';
    } else if (reqId === 'USR-REQ-103' || reqName.includes('Requester 3')) {
      reqId = 'USR-REQ-103';
      reqName = 'Demo Requester 3';
      reqDept = 'Faculty of Engineering';
    } else if (reqId === 'USR-REQ-104') {
      reqId = 'USR-REQ-101';
      reqName = 'Demo Requester 1';
      reqDept = 'Faculty of Pharmacy';
    }

    const requester = {
      id: reqId,
      name: reqName,
      department: reqDept
    };

    const cost_center = String(raw.cost_center || getCostCenterForDepartment(requester.department));

    const startDateRaw = raw.start_date || raw.startDate || (raw.date ? raw.date.split('T')[0] : '2026-10-18');
    const endDateRaw = raw.end_date || raw.endDate || startDateRaw;
    const start_date = startDateRaw.split('T')[0];
    const end_date = endDateRaw.split('T')[0];

    const return_with_vehicle = (raw.return_with_vehicle !== undefined)
      ? Boolean(raw.return_with_vehicle)
      : ((raw.returnTrip !== undefined) ? Boolean(raw.returnTrip) : true);

    let rawPoints = Array.isArray(raw.itinerary) && raw.itinerary.length >= 2
      ? raw.itinerary
      : [
          {
            sequence: 1,
            type: 'departure',
            place_name: raw.origin || 'Badr University in Assiut',
            depart_at: `${start_date}T${raw.departureTime || '08:00'}:00+03:00`,
            pinned: true
          },
          {
            sequence: 2,
            type: return_with_vehicle ? 'return' : 'stop',
            place_name: raw.destination || 'Cairo University',
            arrive_at: `${end_date}T${raw.expectedEnd || '18:00'}:00+03:00`,
            pinned: true
          }
        ];

    const itinerary = rawPoints.map((pt, idx) => {
      const seq = Number(pt.sequence || (idx + 1));
      let type = pt.type;
      if (!type) {
        if (idx === 0) type = 'departure';
        else if (idx === rawPoints.length - 1 && return_with_vehicle) type = 'return';
        else type = 'stop';
      }
      type = type.toLowerCase();

      const isDep = type === 'departure' || idx === 0;
      const isRet = type === 'return';
      const isLastOneWay = (!return_with_vehicle && idx === rawPoints.length - 1);

      const lat = (typeof pt.lat === 'number' && !isNaN(pt.lat)) ? Number(pt.lat.toFixed(6)) : null;
      const lng = (typeof pt.lng === 'number' && !isNaN(pt.lng)) ? Number(pt.lng.toFixed(6)) : null;
      const pinned = Boolean(pt.pinned);
      const approx = Boolean(pt.approx || (!pinned && lat !== null));

      let arrive_at = null;
      if (!isDep) {
        arrive_at = formatEgyptISO(pt.arrive_at, '14:00');
      }

      let depart_at = null;
      if (!isRet && !isLastOneWay) {
        depart_at = formatEgyptISO(pt.depart_at, '08:00');
      }

      return {
        sequence: seq,
        type: type,
        place_name: String(pt.place_name || pt.name || 'Waypoint'),
        lat: lat,
        lng: lng,
        pinned: pinned,
        approx: approx,
        arrive_at: arrive_at,
        depart_at: depart_at,
        notes: String(pt.notes || '')
      };
    });

    let route_legs = [];
    if (Array.isArray(raw.route_legs) && raw.route_legs.length === itinerary.length - 1) {
      route_legs = raw.route_legs.map(leg => ({
        from_seq: Number(leg.from_seq),
        to_seq: Number(leg.to_seq),
        distance_km: Number(leg.distance_km || 0),
        drive_minutes: Number(leg.drive_minutes || 0),
        source: (leg.source === 'route' || leg.isRealRoute) ? 'route' : 'est'
      }));
    } else {
      route_legs = RouteEstimator.computeItineraryLegs(itinerary, 'Passenger Van');
    }

    let assignedVehicle = null;
    let assignment = null;
    const vCode = (raw.assignment && raw.assignment.vehicle_id) || raw.vehicleCode || raw.vehicleId;
    if (vCode && vCode !== 'TBD' && vCode !== 'None') {
      assignedVehicle = allVehicles.find(v => v.code === vCode) || null;
      let dIds = (raw.assignment && Array.isArray(raw.assignment.driver_ids))
        ? raw.assignment.driver_ids
        : (Array.isArray(raw.assignedDriverIds) ? raw.assignedDriverIds : (raw.driverId ? [raw.driverId] : []));
      if (dIds.length === 0 && raw.driver && raw.driver !== 'Pending Assignment') {
        const foundD = allDrivers.find(d => d.name === raw.driver);
        if (foundD) dIds = [foundD.id];
      }
      assignment = {
        vehicle_id: vCode,
        driver_ids: dIds,
        approved_by: (raw.assignment && raw.assignment.approved_by) || raw.approved_by || 'Demo Ops Manager (Dispatcher)',
        approved_at: formatEgyptISO((raw.assignment && raw.assignment.approved_at) || raw.approved_at || raw.createdAt || new Date()),
        linked_to: (raw.assignment && raw.assignment.linked_to) || null,
        deadhead_used_by: (raw.assignment && raw.assignment.deadhead_used_by) || null,
        original_deadhead: (raw.assignment && raw.assignment.original_deadhead) || null,
        repositioning: (raw.assignment && raw.assignment.repositioning) || null
      };
    }

    let deadhead = null;
    if (!return_with_vehicle) {
      if (raw.assignment && raw.assignment.deadhead_used_by) {
        deadhead = null;
      } else if (raw.deadhead && raw.deadhead.to_place) {
        deadhead = {
          from_seq: Number(raw.deadhead.from_seq || itinerary[itinerary.length - 1].sequence),
          to_place: String(raw.deadhead.to_place),
          distance_km: Number(raw.deadhead.distance_km || 0),
          drive_minutes: Number(raw.deadhead.drive_minutes || 0)
        };
      } else if (raw.assignment && raw.assignment.linked_to) {
        deadhead = null;
      } else {
        const basePlace = assignedVehicle ? assignedVehicle.location : itinerary[0].place_name;
        deadhead = calculateDeadheadLeg(itinerary[itinerary.length - 1], basePlace);
      }
    }

    const passengers = Number(raw.passengers || 1);
    const has_extra_cargo = Boolean(raw.has_extra_cargo || (raw.cargo_kg && raw.cargo_kg > 0) || (raw.cargoWeightKg && raw.cargoWeightKg > 0));
    const cargo_kg = has_extra_cargo ? (Number(raw.cargo_kg || raw.cargoWeightKg) || 0) : 0;
    const cargo_description = has_extra_cargo ? String(raw.cargo_description || '') : '';
    const cargo_flags = {
      fragile: Boolean(raw.cargo_flags && raw.cargo_flags.fragile),
      strap: Boolean(raw.cargo_flags && raw.cargo_flags.strap),
      loading_help: Boolean(raw.cargo_flags && raw.cargo_flags.loading_help)
    };

    const driver_overnight_location = String(raw.driver_overnight_location || '');

    let notes_for_dispatch = String(raw.notes_for_dispatch || raw.notes || '').trim();
    if (notes_for_dispatch === 'Official Delegation Mission' || notes_for_dispatch === 'Delegation Mission') {
      notes_for_dispatch = '';
    }

    const baseVehicleLocation = assignedVehicle ? assignedVehicle.location : itinerary[0].place_name;
    const hold_window = calculateHoldWindow({
      start_date,
      end_date,
      return_with_vehicle,
      itinerary,
      deadhead
    }, baseVehicleLocation);

    const priceBook = getPriceBookForDate(start_date);
    let estimate = null;
    if (raw.estimate && raw.estimate.basis && raw.estimate.price_book_version) {
      estimate = {
        basis: raw.estimate.basis === 'vehicle' ? 'vehicle' : 'fleet_average',
        fuel_liters: Number(raw.estimate.fuel_liters || 0),
        cost_egp: Number(raw.estimate.cost_egp || 0),
        price_book_version: String(raw.estimate.price_book_version)
      };
    } else {
      estimate = calculateBookingEstimate({
        start_date,
        itinerary,
        route_legs,
        deadhead,
        has_extra_cargo,
        cargo_kg
      }, assignedVehicle);
    }

    let history = [];
    if (Array.isArray(raw.history) && raw.history.length > 0) {
      history = raw.history.map(h => ({
        status: String(h.status || 'Submitted'),
        at: formatEgyptISO(h.at || h.time || raw.createdAt || new Date()),
        by: String(h.by || h.user || `${requester.name} (Requester)`),
        note: String(h.note || 'Status updated')
      }));
    } else {
      history = [
        {
          status: 'Submitted',
          at: formatEgyptISO(raw.createdAt || new Date()),
          by: `${requester.name} (Requester)`,
          note: 'Initial booking request submitted'
        }
      ];
    }

    let messages = [];
    if (Array.isArray(raw.messages)) {
      messages = raw.messages.map(m => ({
        sender: String(m.sender || 'requester'),
        senderName: String(m.senderName || requester.name),
        time: formatEgyptISO(m.time || new Date()),
        text: String(m.text || '')
      }));
    }

    return {
      id: id,
      status: status,
      requester: requester,
      cost_center: cost_center,
      start_date: start_date,
      end_date: end_date,
      return_with_vehicle: return_with_vehicle,
      itinerary: itinerary,
      route_legs: route_legs,
      deadhead: deadhead,
      passengers: passengers,
      has_extra_cargo: has_extra_cargo,
      cargo_kg: cargo_kg,
      cargo_description: cargo_description,
      cargo_flags: cargo_flags,
      driver_overnight_location: driver_overnight_location,
      notes_for_dispatch: notes_for_dispatch,
      assignment: assignment,
      hold_window: hold_window,
      estimate: estimate,
      history: history,
      messages: messages,
      return_match_savings: raw.return_match_savings || null,
      actuals: raw.actuals || null,
      actualFuelLitres: raw.actualFuelLitres !== undefined ? raw.actualFuelLitres : (raw.actuals ? raw.actuals.fuel_liters : undefined),
      actualOdoStart: raw.actualOdoStart !== undefined ? raw.actualOdoStart : (raw.actuals ? raw.actuals.odometer_start : undefined),
      actualOdoEnd: raw.actualOdoEnd !== undefined ? raw.actualOdoEnd : (raw.actuals ? raw.actuals.odometer_end : undefined),
      fuelVariancePct: raw.fuelVariancePct !== undefined ? raw.fuelVariancePct : undefined,
      reconciled: Boolean(raw.reconciled),
      reconciled_at: raw.reconciled_at || null,
      reconciled_notes: raw.reconciled_notes || null,
      passenger_events: Array.isArray(raw.passenger_events) ? raw.passenger_events : [],
      fuel_logs: Array.isArray(raw.fuel_logs) ? raw.fuel_logs : [],
      start_odometer_km: raw.start_odometer_km !== undefined ? raw.start_odometer_km : (raw.start_odometer ? raw.start_odometer.km : null),
      start_odometer_photo_id: raw.start_odometer_photo_id || (raw.start_odometer ? raw.start_odometer.photo_id : null),
      start_odometer_note: raw.start_odometer_note || '',
      end_odometer_km: raw.end_odometer_km !== undefined ? raw.end_odometer_km : (raw.end_odometer ? raw.end_odometer.km : (raw.actuals ? raw.actuals.odometer_end : null)),
      end_odometer_photo_id: raw.end_odometer_photo_id || (raw.end_odometer ? raw.end_odometer.photo_id : null),
      end_odometer_note: raw.end_odometer_note || ''
    };
  }

  function getInitialData() {
    return {
      settings: JSON.parse(JSON.stringify(DEFAULT_SETTINGS)),
      vehicles: JSON.parse(JSON.stringify(DEFAULT_VEHICLES)),
      drivers: JSON.parse(JSON.stringify(DEFAULT_DRIVERS)),
      bookings: [
        {
          id: 'BK-2047',
          status: 'Pending',
          requester: {
            id: 'USR-REQ-101',
            name: 'Demo Requester 1',
            department: 'Faculty of Pharmacy'
          },
          cost_center: 'CC-410 (Faculty of Pharmacy)',
          start_date: '2026-10-18',
          end_date: '2026-10-22',
          return_with_vehicle: true,
          itinerary: [
            {
              sequence: 1,
              type: 'departure',
              place_name: 'Badr University in Assiut',
              lat: 27.1809,
              lng: 31.1837,
              pinned: true,
              approx: false,
              arrive_at: null,
              depart_at: '2026-10-18T08:00:00+03:00',
              notes: 'Delegation boarding at Main Administrative Gate'
            },
            {
              sequence: 2,
              type: 'stop',
              place_name: 'Cairo University',
              lat: 30.0276,
              lng: 31.2089,
              pinned: true,
              approx: false,
              arrive_at: '2026-10-18T14:30:00+03:00',
              depart_at: '2026-10-19T09:00:00+03:00',
              notes: 'Faculty of Science Lab Meeting'
            },
            {
              sequence: 3,
              type: 'stop',
              place_name: 'Badr University in Cairo',
              lat: 30.1378,
              lng: 31.7456,
              pinned: true,
              approx: false,
              arrive_at: '2026-10-19T10:00:00+03:00',
              depart_at: '2026-10-22T12:40:00+03:00',
              notes: 'Symposium & Central Research Lab'
            },
            {
              sequence: 4,
              type: 'return',
              place_name: 'Badr University in Assiut',
              lat: 27.1809,
              lng: 31.1837,
              pinned: true,
              approx: false,
              arrive_at: '2026-10-22T18:00:00+03:00',
              depart_at: null,
              notes: 'Return vehicle to central base garage'
            }
          ],
          route_legs: [
            { from_seq: 1, to_seq: 2, distance_km: 380, drive_minutes: 310, source: 'route' },
            { from_seq: 2, to_seq: 3, distance_km: 58, drive_minutes: 48, source: 'route' },
            { from_seq: 3, to_seq: 4, distance_km: 420, drive_minutes: 320, source: 'route' }
          ],
          deadhead: null,
          passengers: 4,
          has_extra_cargo: true,
          cargo_kg: 350,
          cargo_description: '6 boxes of lab equipment, 2 projectors, fragile',
          cargo_flags: {
            fragile: true,
            strap: true,
            loading_help: false
          },
          driver_overnight_location: 'BUC Faculty Guesthouse, Badr City',
          notes_for_dispatch: 'Delegates traveling with 2 fragile reagent crates; tie-down straps requested.',
          assignment: null,
          hold_window: {
            start: '2026-10-18T08:00:00+03:00',
            end: '2026-10-22T18:45:00+03:00',
            buffer_minutes: 45
          },
          estimate: {
            basis: 'fleet_average',
            fuel_liters: 85.8,
            cost_egp: 1758.90,
            price_book_version: 'Effective 10 Mar 2026'
          },
          history: [
            {
              status: 'Submitted',
              at: '2026-10-18T07:15:00+03:00',
              by: 'Demo Requester 1 (Requester)',
              note: 'Initial booking request submitted'
            }
          ],
          messages: []
        },
        {
          id: 'BK-2050',
          status: 'Approved',
          requester: {
            id: 'USR-REQ-102',
            name: 'Demo Requester 2',
            department: 'Faculty of Physical Therapy'
          },
          cost_center: 'CC-330 (Faculty of Science)',
          start_date: '2026-10-19',
          end_date: '2026-10-20',
          return_with_vehicle: true,
          itinerary: [
            {
              sequence: 1,
              type: 'departure',
              place_name: 'Badr University in Cairo',
              lat: 30.1378,
              lng: 31.7456,
              pinned: true,
              approx: false,
              arrive_at: null,
              depart_at: '2026-10-19T07:00:00+03:00',
              notes: 'Field research team assembly at Science building'
            },
            {
              sequence: 2,
              type: 'stop',
              place_name: 'Ain Sokhna Marine Research Facility',
              lat: 29.6012,
              lng: 32.3211,
              pinned: true,
              approx: false,
              arrive_at: '2026-10-19T09:30:00+03:00',
              depart_at: '2026-10-20T15:30:00+03:00',
              notes: 'Marine sampling along coastal tide stations'
            },
            {
              sequence: 3,
              type: 'return',
              place_name: 'Badr University in Cairo',
              lat: 30.1378,
              lng: 31.7456,
              pinned: true,
              approx: false,
              arrive_at: '2026-10-20T18:00:00+03:00',
              depart_at: null,
              notes: 'Return delegation to BUC Campus'
            }
          ],
          route_legs: [
            { from_seq: 1, to_seq: 2, distance_km: 110, drive_minutes: 85, source: 'route' },
            { from_seq: 2, to_seq: 3, distance_km: 110, drive_minutes: 85, source: 'route' }
          ],
          deadhead: null,
          passengers: 12,
          has_extra_cargo: false,
          cargo_kg: 0,
          cargo_description: '',
          cargo_flags: {
            fragile: false,
            strap: false,
            loading_help: false
          },
          driver_overnight_location: 'Ain Sokhna Marine Station Guesthouse',
          notes_for_dispatch: 'Research sample cooler containers carried as personal baggage.',
          assignment: {
            vehicle_id: 'V-130',
            driver_ids: ['D-102'],
            approved_by: 'Demo Ops Manager (Dispatcher)',
            approved_at: '2026-10-18T10:00:00+03:00'
          },
          hold_window: {
            start: '2026-10-19T07:00:00+03:00',
            end: '2026-10-20T18:45:00+03:00',
            buffer_minutes: 45
          },
          estimate: {
            basis: 'vehicle',
            fuel_liters: 23.1,
            cost_egp: 473.55,
            price_book_version: 'Effective 10 Mar 2026'
          },
          history: [
            {
              status: 'Submitted',
              at: '2026-10-18T08:00:00+03:00',
              by: 'Demo Requester 2 (Requester)',
              note: 'Initial booking request submitted'
            },
            {
              status: 'Approved',
              at: '2026-10-18T10:00:00+03:00',
              by: 'Demo Ops Manager (Dispatcher)',
              note: 'Assigned Toyota HiAce (V-130) with driver Demo Driver 02'
            }
          ],
          messages: []
        },
        {
          id: 'BK-2048',
          status: 'Changes requested',
          requester: {
            id: 'USR-REQ-103',
            name: 'Demo Requester 3',
            department: 'Faculty of Engineering'
          },
          cost_center: 'CC-220 (Faculty of Engineering)',
          start_date: '2026-10-24',
          end_date: '2026-10-25',
          return_with_vehicle: false,
          itinerary: [
            {
              sequence: 1,
              type: 'departure',
              place_name: 'Cairo University',
              lat: 30.0276,
              lng: 31.2089,
              pinned: true,
              approx: false,
              arrive_at: null,
              depart_at: '2026-10-24T06:00:00+03:00',
              notes: 'Engineering inspection team departure'
            },
            {
              sequence: 2,
              type: 'stop',
              place_name: 'Alexandria University / Borg El Arab',
              lat: 31.2001,
              lng: 29.9187,
              pinned: true,
              approx: false,
              arrive_at: '2026-10-25T16:00:00+03:00',
              depart_at: null,
              notes: 'Drop-off at Borg El Arab campus laboratory'
            }
          ],
          route_legs: [
            { from_seq: 1, to_seq: 2, distance_km: 218, drive_minutes: 160, source: 'route' }
          ],
          deadhead: {
            from_seq: 2,
            to_place: 'Cairo University',
            distance_km: 218,
            drive_minutes: 160
          },
          passengers: 3,
          has_extra_cargo: false,
          cargo_kg: 0,
          cargo_description: '',
          cargo_flags: {
            fragile: false,
            strap: false,
            loading_help: false
          },
          driver_overnight_location: '',
          notes_for_dispatch: 'One-way drop-off. Vehicle empty return to base.',
          assignment: null,
          hold_window: {
            start: '2026-10-24T06:00:00+03:00',
            end: '2026-10-25T19:25:00+03:00',
            buffer_minutes: 45
          },
          estimate: {
            basis: 'fleet_average',
            fuel_liters: 43.6,
            cost_egp: 893.80,
            price_book_version: 'Effective 10 Mar 2026'
          },
          history: [
            {
              status: 'Submitted',
              at: '2026-10-18T10:00:00+03:00',
              by: 'Demo Requester 3 (Requester)',
              note: 'Initial booking request submitted'
            },
            {
              status: 'Changes requested',
              at: '2026-10-18T12:00:00+03:00',
              by: 'Demo Ops Manager (Dispatcher)',
              note: 'Please adjust departure time from 06:00 to 07:30 to match driver shift availability.'
            }
          ],
          messages: []
        },
        {
          id: 'BK-2049',
          status: 'Rejected',
          requester: {
            id: 'USR-REQ-101',
            name: 'Demo Requester 1',
            department: 'General Administration'
          },
          cost_center: 'CC-100 (General Administration)',
          start_date: '2026-10-28',
          end_date: '2026-10-28',
          return_with_vehicle: false,
          itinerary: [
            {
              sequence: 1,
              type: 'departure',
              place_name: 'Plant 3 — 10th of Ramadan',
              lat: 30.3012,
              lng: 31.7432,
              pinned: true,
              approx: false,
              arrive_at: null,
              depart_at: '2026-10-28T09:00:00+03:00',
              notes: 'Industrial warehouse exit gate'
            },
            {
              sequence: 2,
              type: 'stop',
              place_name: 'Supplier Depot — Obour City',
              lat: 30.2241,
              lng: 31.4589,
              pinned: true,
              approx: false,
              arrive_at: '2026-10-28T14:00:00+03:00',
              depart_at: null,
              notes: 'Receiving docks'
            }
          ],
          route_legs: [
            { from_seq: 1, to_seq: 2, distance_km: 29.4, drive_minutes: 30, source: 'route' }
          ],
          deadhead: {
            from_seq: 2,
            to_place: 'Plant 3 — 10th of Ramadan',
            distance_km: 29.4,
            drive_minutes: 30
          },
          passengers: 2,
          has_extra_cargo: true,
          cargo_kg: 600,
          cargo_description: 'Industrial heavy components',
          cargo_flags: {
            fragile: false,
            strap: true,
            loading_help: true
          },
          driver_overnight_location: '',
          notes_for_dispatch: 'Courier transport requisition.',
          assignment: null,
          hold_window: {
            start: '2026-10-28T09:00:00+03:00',
            end: '2026-10-28T15:15:00+03:00',
            buffer_minutes: 45
          },
          estimate: {
            basis: 'fleet_average',
            fuel_liters: 6.4,
            cost_egp: 131.20,
            price_book_version: 'Effective 10 Mar 2026'
          },
          history: [
            {
              status: 'Submitted',
              at: '2026-10-18T11:00:00+03:00',
              by: 'Demo Requester 1 (Requester)',
              note: 'Initial booking request submitted'
            },
            {
              status: 'Rejected',
              at: '2026-10-18T13:00:00+03:00',
              by: 'Demo Ops Manager (Dispatcher)',
              note: 'Outside policy: Cargo exceeds standard courier limit and non-official transport is not approved for this cost center.'
            }
          ],
          messages: []
        },
        {
          id: 'BK-2045',
          status: 'Completed',
          requester: {
            id: 'USR-REQ-101',
            name: 'Demo Requester 1',
            department: 'Faculty of Pharmacy'
          },
          cost_center: 'CC-410 (Faculty of Pharmacy)',
          start_date: '2026-10-12',
          end_date: '2026-10-12',
          return_with_vehicle: false,
          itinerary: [
            {
              sequence: 1,
              type: 'departure',
              place_name: 'Badr University in Cairo',
              lat: 30.1378,
              lng: 31.7456,
              pinned: true,
              approx: false,
              arrive_at: null,
              depart_at: '2026-10-12T14:00:00+03:00',
              notes: 'Campus Admin Gate'
            },
            {
              sequence: 2,
              type: 'stop',
              place_name: 'Cairo International Airport T3',
              lat: 30.1114,
              lng: 31.4065,
              pinned: true,
              approx: false,
              arrive_at: '2026-10-12T17:30:00+03:00',
              depart_at: null,
              notes: 'Terminal 3 Arrivals Hall'
            }
          ],
          route_legs: [
            { from_seq: 1, to_seq: 2, distance_km: 42.0, drive_minutes: 45, source: 'route' }
          ],
          deadhead: {
            from_seq: 2,
            to_place: 'Badr University in Cairo',
            distance_km: 42.0,
            drive_minutes: 45
          },
          passengers: 2,
          has_extra_cargo: false,
          cargo_kg: 0,
          cargo_description: '',
          cargo_flags: {
            fragile: false,
            strap: false,
            loading_help: false
          },
          driver_overnight_location: '',
          notes_for_dispatch: 'Visiting external accreditation delegation pickup.',
          assignment: {
            vehicle_id: 'V-205',
            driver_ids: ['D-101'],
            approved_by: 'Demo Ops Manager (Dispatcher)',
            approved_at: '2026-10-11T16:00:00+03:00'
          },
          hold_window: {
            start: '2026-10-12T14:00:00+03:00',
            end: '2026-10-12T19:00:00+03:00',
            buffer_minutes: 45
          },
          estimate: {
            basis: 'vehicle',
            fuel_liters: 5.7,
            cost_egp: 136.80,
            price_book_version: 'Effective 10 Mar 2026'
          },
          history: [
            {
              status: 'Submitted',
              at: '2026-10-11T12:00:00+03:00',
              by: 'Demo Requester 1 (Requester)',
              note: 'Initial booking request submitted'
            },
            {
              status: 'Approved',
              at: '2026-10-11T16:00:00+03:00',
              by: 'Demo Ops Manager (Dispatcher)',
              note: 'Assigned Toyota Corolla (V-205) with driver Demo Driver 01'
            },
            {
              status: 'Completed',
              at: '2026-10-12T19:15:00+03:00',
              by: 'Demo Ops Manager (Dispatcher)',
              note: 'Trip reconciled and closed'
            }
          ],
          messages: []
        },
        {
          id: 'BK-2061',
          status: 'Approved',
          requester: {
            id: 'USR-REQ-102',
            name: 'Demo Requester 2',
            department: 'Faculty of Physical Therapy'
          },
          cost_center: 'CC-420 (Faculty of Physical Therapy)',
          start_date: '2026-10-18',
          end_date: '2026-10-18',
          return_with_vehicle: false,
          itinerary: [
            {
              sequence: 1,
              type: 'departure',
              place_name: 'Alexandria Branch (CIRA)',
              lat: 31.2001,
              lng: 29.9187,
              pinned: true,
              approx: false,
              arrive_at: null,
              depart_at: '2026-10-18T09:00:00+03:00',
              notes: 'Depart from Alexandria campus main gate'
            },
            {
              sequence: 2,
              type: 'stop',
              place_name: 'Cairo University',
              lat: 30.0276,
              lng: 31.2089,
              pinned: true,
              approx: false,
              arrive_at: '2026-10-18T12:20:00+03:00',
              depart_at: null,
              notes: 'Drop off delegation at Medical Campus'
            }
          ],
          route_legs: [
            { from_seq: 1, to_seq: 2, distance_km: 218, drive_minutes: 170, source: 'route' }
          ],
          deadhead: {
            from_seq: 2,
            to_place: 'Alexandria Branch (CIRA)',
            distance_km: 218,
            drive_minutes: 170
          },
          passengers: 4,
          has_extra_cargo: false,
          cargo_kg: 0,
          cargo_description: '',
          cargo_flags: { fragile: false, strap: false, loading_help: false },
          driver_overnight_location: '',
          notes_for_dispatch: 'Official medical delegation one-way transport to Cairo.',
          assignment: {
            vehicle_id: 'V-125',
            driver_ids: ['D-107'],
            approved_by: 'Demo Ops Manager (Dispatcher)',
            approved_at: '2026-10-17T14:00:00+03:00'
          },
          hold_window: {
            start: '2026-10-18T09:00:00+03:00',
            end: '2026-10-18T16:00:00+03:00',
            buffer_minutes: 45
          },
          estimate: {
            basis: 'vehicle',
            fuel_liters: 43.6,
            cost_egp: 893.80,
            price_book_version: 'Effective 10 Mar 2026'
          },
          history: [
            {
              status: 'Submitted',
              at: '2026-10-17T10:00:00+03:00',
              by: 'Demo Requester 2 (Requester)',
              note: 'Initial booking request submitted'
            },
            {
              status: 'Approved',
              at: '2026-10-17T14:00:00+03:00',
              by: 'Demo Ops Manager (Dispatcher)',
              note: 'Assigned Toyota HiAce (V-125) with driver Demo Driver 07'
            }
          ],
          messages: []
        },
        {
          id: 'BK-2062',
          status: 'Pending',
          requester: {
            id: 'USR-REQ-103',
            name: 'Demo Requester 3',
            department: 'Faculty of Engineering'
          },
          cost_center: 'CC-430 (Faculty of Engineering)',
          start_date: '2026-10-18',
          end_date: '2026-10-18',
          return_with_vehicle: false,
          itinerary: [
            {
              sequence: 1,
              type: 'departure',
              place_name: 'Cairo University',
              lat: 30.0276,
              lng: 31.2089,
              pinned: true,
              approx: false,
              arrive_at: null,
              depart_at: '2026-10-18T13:30:00+03:00',
              notes: 'Pickup delegation at Main Administration Building'
            },
            {
              sequence: 2,
              type: 'stop',
              place_name: 'Alexandria Branch (CIRA)',
              lat: 31.2001,
              lng: 29.9187,
              pinned: true,
              approx: false,
              arrive_at: '2026-10-18T16:20:00+03:00',
              depart_at: null,
              notes: 'Return transfer to Alexandria campus'
            }
          ],
          route_legs: [
            { from_seq: 1, to_seq: 2, distance_km: 218, drive_minutes: 170, source: 'route' }
          ],
          deadhead: null,
          passengers: 3,
          has_extra_cargo: false,
          cargo_kg: 0,
          cargo_description: '',
          cargo_flags: { fragile: false, strap: false, loading_help: false },
          driver_overnight_location: '',
          notes_for_dispatch: 'Engineering faculty delegates returning to Alexandria.',
          assignment: null,
          hold_window: {
            start: '2026-10-18T13:30:00+03:00',
            end: '2026-10-18T17:05:00+03:00',
            buffer_minutes: 45
          },
          estimate: {
            basis: 'fleet_average',
            fuel_liters: 21.8,
            cost_egp: 446.90,
            price_book_version: 'Effective 10 Mar 2026'
          },
          history: [
            {
              status: 'Submitted',
              at: '2026-10-18T10:15:00+03:00',
              by: 'Demo Requester 3 (Requester)',
              note: 'Booking submitted for afternoon departure'
            }
          ],
          messages: []
        }
      ],
      auditTrail: [
        {
          id: 'AUD-8801',
          time: 'Today · 08:35',
          user: 'Demo Ops Manager (Dispatcher)',
          action: 'Approve Multi-Day Itinerary',
          ref: 'BK-2050',
          details: 'Assigned Toyota HiAce (V-130) with Driver Demo Driver 02 for Marine Field Trip.'
        }
      ],
      notifications: [
        {
          id: 'NOTIF-1',
          targetRole: 'Dispatcher',
          title: 'New Booking Awaiting Operations Review',
          message: 'Demo Requester 1 submitted 5-day itinerary BK-2047 (Assiut → Cairo → BUC).',
          time: '2 hours ago',
          read: false,
          link: 'dispatch-queue.html?id=BK-2047'
        }
      ]
    };
  }

  const FleetStore = {
    RouteEstimator: RouteEstimator,

    load: function () {
      let parsed = null;
      try {
        const raw = typeof localStorage !== 'undefined' ? localStorage.getItem(STORAGE_KEY) : null;
        if (raw) parsed = JSON.parse(raw);
      } catch (e) {}

      if (!parsed) {
        parsed = getInitialData();
      }

      if (!parsed.settings) parsed.settings = JSON.parse(JSON.stringify(DEFAULT_SETTINGS));
      if (!parsed.sites || parsed.sites.length === 0) parsed.sites = JSON.parse(JSON.stringify(DEFAULT_SITES));
      if (!parsed.vehicles || parsed.vehicles.length === 0) parsed.vehicles = JSON.parse(JSON.stringify(DEFAULT_VEHICLES));
      if (!parsed.drivers || parsed.drivers.length === 0) parsed.drivers = JSON.parse(JSON.stringify(DEFAULT_DRIVERS));

      parsed.sites = (parsed.sites || []).filter(s => s && s.id !== 'SITE-SUEZCA');
      parsed.vehicles = (parsed.vehicles || []).filter(v => v && v.id !== 'V-TEST-99' && v.code !== 'V-TEST-99');
      parsed.drivers = (parsed.drivers || []).filter(d => d && d.id !== 'D-TEST-99' && (!d.name || !d.name.includes('TEST-99')) && (!d.id || !d.id.includes('TEST-99')));
      parsed.bookings = (parsed.bookings || []).filter(b => b && b.id !== 'BK-TEST-99' && (!b.assignment || b.assignment.vehicle_id !== 'V-TEST-99'));

      DEFAULT_SITES.forEach(ds => {
        if (!parsed.sites.some(s => s.id === ds.id)) {
          parsed.sites.push(JSON.parse(JSON.stringify(ds)));
        }
      });

      if (parsed.settings.fuelPrices) {
        parsed.settings.fuelPrices.activeVersion = 'Effective 10 Mar 2026';
        parsed.settings.fuelPrices.rates = {
          diesel: 20.50,
          petrol92: 22.25,
          petrol95: 24.00,
          cng: 13.00
        };
      }

      if (parsed.settings && parsed.settings.rules && !parsed.settings.rules.returnMatch) {
        parsed.settings.rules.returnMatch = {
          maxPickupDistanceKm: 15,
          maxWaitHours: 3,
          maxDetourMinutes: 30
        };
      }

      parsed.bookings = parsed.bookings || [];
      const initData = getInitialData();
      ['BK-2061', 'BK-2062'].forEach(seedId => {
        if (!parsed.bookings.some(b => b.id === seedId)) {
          const seedB = initData.bookings.find(b => b.id === seedId);
          if (seedB) {
            parsed.bookings.push(JSON.parse(JSON.stringify(seedB)));
          }
        }
      });

      if (!parsed.vehicles.some(v => v.code === 'V-125')) {
        parsed.vehicles.push({
          code: 'V-125',
          plate: 'BDR 8102',
          model: 'Toyota HiAce',
          year: 2023,
          category: 'Passenger Van',
          type: 'Van',
          seats: 12,
          payloadKg: 1100,
          fuelType: 'Diesel',
          ratePer100Km: 10.0,
          status: 'Available',
          location: 'Alexandria University / Borg El Arab',
          home_site_id: 'SITE-ALEX',
          odo: 38200
        });
      }
      if (!parsed.vehicles.some(v => v.code === 'S-14')) {
        parsed.vehicles.push({
          code: 'S-14',
          plate: 'BDR 4591',
          model: 'Hyundai Elantra',
          year: 2024,
          category: 'Sedan',
          type: 'Sedan',
          seats: 4,
          payloadKg: 400,
          fuelType: 'Petrol 92',
          ratePer100Km: 7.0,
          status: 'Available',
          location: 'Alexandria University / Borg El Arab',
          home_site_id: 'SITE-ALEX',
          odo: 21500
        });
      }

      // Migrate existing vehicle and driver home sites
      (parsed.vehicles || []).forEach(v => {
        if (v.last_odometer_km === undefined) {
          v.last_odometer_km = Number(v.odo || 0);
        }
        if (!v.home_site_id) {
          const loc = (v.location || '').toLowerCase();
          const base = (v.base || '').toLowerCase();
          const target = `${loc} ${base}`;

          const matchedSite = parsed.sites.find(s => {
            const cityName = (s.city || '').toLowerCase();
            const siteName = (s.name || '').toLowerCase();
            return (cityName && target.includes(cityName)) || (siteName && target.includes(siteName));
          });

          if (matchedSite) {
            v.home_site_id = matchedSite.id;
          } else if (target.includes('obour') || target.includes('ramadan') || target.includes('depot')) {
            v.home_site_id = 'SITE-BUC';
          } else if (target.includes('airport') || target.includes('workshop')) {
            v.home_site_id = 'SITE-HQ';
          } else {
            v.home_site_id = null;
          }
        }
      });

      (parsed.drivers || []).forEach(d => {
        if (!d.home_site_id) {
          const branch = (d.branch || '').toLowerCase();
          const matchedSite = parsed.sites.find(s => {
            const cityName = (s.city || '').toLowerCase();
            const siteName = (s.name || '').toLowerCase();
            return (cityName && branch.includes(cityName)) || (siteName && branch.includes(siteName));
          });
          if (matchedSite) {
            d.home_site_id = matchedSite.id;
          } else {
            const defD = DEFAULT_DRIVERS.find(item => item.id === d.id);
            d.home_site_id = (defD && defD.home_site_id) ? defD.home_site_id : 'SITE-BUC';
          }
        }
      });

      const rawBookings = Array.isArray(parsed.bookings) ? parsed.bookings : [];
      let maxNumericId = 2050;
      rawBookings.forEach(b => {
        if (b && b.id) {
          const m = String(b.id).match(/^BK-(\d+)$/i);
          if (m) {
            const n = parseInt(m[1], 10);
            if (!isNaN(n) && n > maxNumericId) maxNumericId = n;
          }
        }
      });

      const idGroups = {};
      rawBookings.forEach((b, idx) => {
        const id = b.id || `BK-${2050 + idx}`;
        if (!idGroups[id]) idGroups[id] = [];
        idGroups[id].push(b);
      });

      const deduplicated = [];
      for (const [id, group] of Object.entries(idGroups)) {
        if (group.length === 1) {
          deduplicated.push(group[0]);
        } else {
          group.sort((a, b) => {
            const timeA = new Date(a.createdAt || (a.history && a.history[0] ? a.history[0].at : 0)).getTime() || 0;
            const timeB = new Date(b.createdAt || (b.history && b.history[0] ? b.history[0].at : 0)).getTime() || 0;
            return timeA - timeB;
          });

          deduplicated.push(group[0]);

          for (let i = 1; i < group.length; i++) {
            const candidate = group[i];
            const isExact = JSON.stringify(candidate) === JSON.stringify(group[0]);
            if (!isExact) {
              maxNumericId++;
              candidate.id = `BK-${maxNumericId}`;
              deduplicated.push(candidate);
            }
          }
        }
      }

      parsed.bookings = deduplicated
        .map(raw => migrateBooking(raw, parsed.vehicles, parsed.drivers))
        .filter(Boolean);

      (parsed.drivers || []).forEach(d => {
        if (d.id && d.id.startsWith('D-')) {
          const num = d.id.replace('D-', '').padStart(2, '0');
          d.name = `Demo Driver ${num}`;
          d.licenseNo = `LIC-DEMO-${d.id.replace('D-', '').padStart(4, '0')}`;
          d.phone = '+20 000 000 0000';
          d.email = `demo.driver${num}@example.com`;
        }
      });

      if (parsed.settings && parsed.settings.contacts) {
        parsed.settings.contacts.emergencyHotline = '+20 000 000 0000';
        parsed.settings.contacts.email = 'operations@example.com';
        parsed.settings.contacts.dispatchDesk = 'Ext. 0000';
      }

      return parsed;
    },

    save: function (data) {
      if (!data || !Array.isArray(data.bookings)) {
        throw new Error('Data integrity error: invalid payload for FleetStore.save');
      }

      const seenIds = new Set();
      for (const b of data.bookings) {
        if (!b || !b.id) {
          throw new Error('Data integrity violation: Booking record has no id');
        }
        if (seenIds.has(b.id)) {
          throw new Error(`Data integrity violation: Duplicate booking id "${b.id}" detected. Save refused.`);
        }
        seenIds.add(b.id);
      }

      try {
        if (typeof localStorage !== 'undefined') {
          localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
        }
      } catch (e) {
        console.error('Failed to save to localStorage:', e);
      }
    },

    reset: function () {
      if (typeof localStorage !== 'undefined') {
        localStorage.removeItem(STORAGE_KEY);
      }
      return this.load();
    },

    clearAll: function () {
      const empty = {
        settings: JSON.parse(JSON.stringify(DEFAULT_SETTINGS)),
        vehicles: JSON.parse(JSON.stringify(DEFAULT_VEHICLES)),
        drivers: JSON.parse(JSON.stringify(DEFAULT_DRIVERS)),
        bookings: [],
        auditTrail: [],
        notifications: []
      };
      this.save(empty);
      return empty;
    },

    resetDemo: function () {
      if (typeof localStorage !== 'undefined') {
        localStorage.removeItem(STORAGE_KEY);
      }
      const init = getInitialData();
      this.save(init);
      return init;
    },

    getCiraInstitutions: function () {
      return CIRA_INSTITUTIONS;
    },

    getSites: function () {
      const data = this.load();
      return (data.sites && data.sites.length > 0) ? data.sites : DEFAULT_SITES;
    },

    listSites: function (filter = {}) {
      const data = this.load();
      const sites = (data.sites && data.sites.length > 0) ? data.sites : DEFAULT_SITES;
      const vehicles = data.vehicles || [];
      const drivers = data.drivers || [];

      const enriched = sites.map(s => {
        const vCount = vehicles.filter(v => v.home_site_id === s.id).length;
        const dCount = drivers.filter(d => d.home_site_id === s.id).length;
        return {
          ...s,
          vehicleCount: vCount,
          driverCount: dCount
        };
      });

      if (filter && filter.activeOnly) {
        return enriched.filter(s => s.active !== false);
      }
      return enriched;
    },

    getSite: function (id) {
      if (!id) return null;
      const data = this.load();
      const sites = (data.sites && data.sites.length > 0) ? data.sites : DEFAULT_SITES;
      return sites.find(s => s.id === id) || null;
    },

    getSiteByName: function (name) {
      if (!name) return null;
      const lower = name.trim().toLowerCase();
      const data = this.load();
      const sites = (data.sites && data.sites.length > 0) ? data.sites : DEFAULT_SITES;
      return sites.find(s => {
        const sName = (s.name || '').toLowerCase();
        return sName === lower || sName.includes(lower) || lower.includes(sName);
      }) || null;
    },

    saveSite: function (siteData, user = 'Demo Fleet Admin (Fleet Admin)') {
      if (!siteData || !siteData.name || !siteData.name.trim()) {
        return { success: false, error: 'Site name is required.' };
      }
      const data = this.load();
      data.sites = data.sites || [];

      const nameTrimmed = siteData.name.trim();
      const existingName = data.sites.find(s =>
        s.id !== siteData.id && s.name.trim().toLowerCase() === nameTrimmed.toLowerCase()
      );
      if (existingName) {
        return { success: false, error: `A site with the name "${nameTrimmed}" already exists.` };
      }

      let site;
      let isNew = false;
      if (siteData.id) {
        site = data.sites.find(s => s.id === siteData.id);
      }
      if (!site) {
        isNew = true;
        const idSlug = nameTrimmed.replace(/[^a-zA-Z0-9]/g, '').substring(0, 6).toUpperCase();
        site = {
          id: `SITE-${idSlug || Math.floor(100 + Math.random() * 900)}`
        };
        data.sites.push(site);
      }

      site.name = nameTrimmed;
      site.institution = siteData.institution || 'Badr University in Cairo (BUC)';
      site.city = siteData.city || 'Cairo';
      site.address = siteData.address || '';
      site.lat = (typeof siteData.lat === 'number') ? siteData.lat : Number(siteData.lat) || 30.1378;
      site.lng = (typeof siteData.lng === 'number') ? siteData.lng : Number(siteData.lng) || 31.7456;
      site.pinned = Boolean(siteData.pinned);
      site.to_verify = (siteData.to_verify !== undefined) ? Boolean(siteData.to_verify) : (!site.pinned);
      site.active = (siteData.active !== undefined) ? Boolean(siteData.active) : true;

      data.auditTrail = data.auditTrail || [];
      data.auditTrail.unshift({
        id: 'AUD-' + Math.floor(1000 + Math.random() * 9000),
        time: 'Just now',
        user: user,
        action: isNew ? 'Create CIRA Site' : 'Update CIRA Site',
        ref: site.id,
        details: `${isNew ? 'Created' : 'Updated'} site "${site.name}" (${site.city}) with coordinates [${site.lat.toFixed(4)}, ${site.lng.toFixed(4)}]. Pinned: ${site.pinned}.`
      });

      this.save(data);
      return { success: true, site: site };
    },

    deactivateSite: function (id, user = 'Demo Fleet Admin (Fleet Admin)') {
      const data = this.load();
      const site = (data.sites || []).find(s => s.id === id);
      if (!site) return { success: false, error: 'Site not found.' };

      site.active = false;
      data.auditTrail = data.auditTrail || [];
      data.auditTrail.unshift({
        id: 'AUD-' + Math.floor(1000 + Math.random() * 9000),
        time: 'Just now',
        user: user,
        action: 'Deactivate CIRA Site',
        ref: id,
        details: `Deactivated site "${site.name}".`
      });

      this.save(data);
      return { success: true, site: site };
    },

    activateSite: function (id, user = 'Demo Fleet Admin (Fleet Admin)') {
      const data = this.load();
      const site = (data.sites || []).find(s => s.id === id);
      if (!site) return { success: false, error: 'Site not found.' };

      site.active = true;
      data.auditTrail = data.auditTrail || [];
      data.auditTrail.unshift({
        id: 'AUD-' + Math.floor(1000 + Math.random() * 9000),
        time: 'Just now',
        user: user,
        action: 'Activate CIRA Site',
        ref: id,
        details: `Re-activated site "${site.name}".`
      });

      this.save(data);
      return { success: true, site: site };
    },

    deleteSite: function (id, user = 'Demo Fleet Admin (Fleet Admin)') {
      const data = this.load();
      const site = (data.sites || []).find(s => s.id === id);
      if (!site) return { success: false, error: 'Site not found.' };

      const vCount = (data.vehicles || []).filter(v => v.home_site_id === id).length;
      const dCount = (data.drivers || []).filter(d => d.home_site_id === id).length;
      if (vCount > 0 || dCount > 0) {
        return {
          success: false,
          error: `Cannot delete site "${site.name}": ${vCount} vehicle(s) and ${dCount} driver(s) are assigned to it. Deactivate the site instead.`
        };
      }

      data.sites = data.sites.filter(s => s.id !== id);
      data.auditTrail = data.auditTrail || [];
      data.auditTrail.unshift({
        id: 'AUD-' + Math.floor(1000 + Math.random() * 9000),
        time: 'Just now',
        user: user,
        action: 'Delete CIRA Site',
        ref: id,
        details: `Deleted empty site "${site.name}".`
      });

      this.save(data);
      return { success: true };
    },

    updateVehicleHomeSite: function (vehicleCode, newHomeSiteId, reason, user = 'Demo Fleet Admin (Fleet Admin)') {
      if (!reason || !reason.trim()) {
        return { success: false, error: 'A reason is required when changing a vehicle home site.' };
      }
      const data = this.load();
      const v = (data.vehicles || []).find(item => item.code === vehicleCode);
      if (!v) return { success: false, error: `Vehicle ${vehicleCode} not found.` };

      const newSite = (data.sites || []).find(s => s.id === newHomeSiteId);
      if (!newSite) return { success: false, error: 'Target home site not found.' };
      if (!newSite.active) return { success: false, error: 'Cannot assign an inactive site as home site.' };

      const oldSite = (data.sites || []).find(s => s.id === v.home_site_id);
      const upcoming = (data.bookings || []).filter(b =>
        ['Approved', 'Dispatched', 'Active'].includes(b.status) &&
        b.assignment && b.assignment.vehicle_id === vehicleCode
      );

      v.home_site_id = newHomeSiteId;
      v.location = newSite.name;

      data.auditTrail = data.auditTrail || [];
      data.auditTrail.unshift({
        id: 'AUD-' + Math.floor(1000 + Math.random() * 9000),
        time: 'Just now',
        user: user,
        action: 'Change Vehicle Home Site',
        ref: vehicleCode,
        details: `Reassigned ${vehicleCode} (${v.model}) from ${oldSite ? oldSite.name : 'Unassigned'} to ${newSite.name}. Reason: "${reason.trim()}".`
      });

      this.save(data);

      return {
        success: true,
        vehicle: v,
        warning: upcoming.length > 0
          ? `Warning: Vehicle has ${upcoming.length} upcoming approved booking(s) (${upcoming.map(b => b.id).join(', ')}). Existing bookings keep their original base.`
          : null
      };
    },

    saveVehicle: function (vData, reason = '', user = 'Demo Fleet Admin (Fleet Admin)') {
      if (!vData || !vData.code) return { success: false, error: 'Vehicle code is required.' };
      const data = this.load();
      data.vehicles = data.vehicles || [];

      let v = data.vehicles.find(item => item.code === vData.code);
      let isNew = false;
      let warning = null;

      if (!v) {
        isNew = true;
        v = { code: vData.code };
        data.vehicles.push(v);
      } else if (v.home_site_id && vData.home_site_id && v.home_site_id !== vData.home_site_id) {
        if (!reason || !reason.trim()) {
          return { success: false, error: 'A reason is required when changing a vehicle home site.' };
        }
        const siteChangeResult = this.updateVehicleHomeSite(v.code, vData.home_site_id, reason, user);
        if (!siteChangeResult.success) return siteChangeResult;
        warning = siteChangeResult.warning;
      }

      v.plate = vData.plate || v.plate || 'BDR 0000';
      v.model = vData.model || v.model || 'Unknown';
      v.year = Number(vData.year) || v.year || 2023;
      v.category = vData.category || v.category || 'Passenger Van';
      v.type = vData.type || v.type || 'Van';
      v.seats = Number(vData.seats) || v.seats || 4;
      v.payloadKg = Number(vData.payloadKg) || v.payloadKg || 500;
      v.fuelType = vData.fuelType || v.fuelType || 'Diesel';
      v.ratePer100Km = Number(vData.ratePer100Km) || v.ratePer100Km || 10.0;
      v.status = vData.status || v.status || 'Available';
      v.odo = Number(vData.odo) || v.odo || 0;
      if (vData.home_site_id) v.home_site_id = vData.home_site_id;
      if (!v.location && v.home_site_id) {
        const site = (data.sites || []).find(s => s.id === v.home_site_id);
        if (site) v.location = site.name;
      }

      this.save(data);
      return { success: true, vehicle: v, warning: warning };
    },

    saveDriver: function (dData, user = 'Demo Fleet Admin (Fleet Admin)') {
      if (!dData) return { success: false, error: 'Driver data is required.' };
      const data = this.load();
      data.drivers = data.drivers || [];

      let dId = (dData.id || '').trim();
      let d = dId ? data.drivers.find(item => item.id === dId) : null;
      let isNew = false;
      if (!d) {
        isNew = true;
        if (!dId) {
          dId = `DRV-${Math.floor(100 + Math.random() * 900)}`;
        }
        d = { id: dId };
        data.drivers.push(d);
      }

      d.name = dData.name || d.name || 'Unnamed Driver';
      d.home_site_id = dData.home_site_id || d.home_site_id || 'SITE-BUC';
      d.licenseClass = dData.licenseClass || d.licenseClass || 'Class 2 (Professional 2nd)';
      d.licenseNo = dData.licenseNo || d.licenseNo || 'EG-CAI-00000';
      d.expires = dData.expires || d.expires || '2028-01-01';
      d.status = dData.status || d.status || 'Available';
      d.totalTrips = Number(dData.totalTrips) || d.totalTrips || 0;
      d.allowedVehicles = dData.allowedVehicles || d.allowedVehicles || ['Sedan', 'Van'];

      this.save(data);
      return { success: true, driver: d };
    },

    updateDriverHomeSite: function (driverId, newHomeSiteId, user = 'Demo Fleet Admin (Fleet Admin)') {
      const data = this.load();
      const d = (data.drivers || []).find(item => item.id === driverId);
      if (!d) return { success: false, error: 'Driver not found.' };

      const site = (data.sites || []).find(s => s.id === newHomeSiteId);
      if (!site) return { success: false, error: 'Target site not found.' };

      d.home_site_id = newHomeSiteId;
      this.save(data);
      return { success: true, driver: d };
    },

    getMigrationReport: function () {
      const data = this.load();
      const vehicles = data.vehicles || [];
      const drivers = data.drivers || [];

      const unmatchedVehicles = vehicles.filter(v => !v.home_site_id);
      const unmatchedDrivers = drivers.filter(d => !d.home_site_id);

      return {
        matchedVehiclesCount: vehicles.length - unmatchedVehicles.length,
        unmatchedVehicles: unmatchedVehicles,
        matchedDriversCount: drivers.length - unmatchedDrivers.length,
        unmatchedDrivers: unmatchedDrivers
      };
    },

    getSettings: function () {
      const data = this.load();
      return data.settings || DEFAULT_SETTINGS;
    },

    saveSettings: function (newSettings, user = 'Demo Fleet Admin (Fleet Admin)') {
      const data = this.load();
      data.settings = data.settings || JSON.parse(JSON.stringify(DEFAULT_SETTINGS));
      if (newSettings.rules) {
        data.settings.rules = { ...data.settings.rules, ...newSettings.rules };
      }
      if (newSettings.system) {
        data.settings.system = { ...data.settings.system, ...newSettings.system };
      }
      data.auditTrail = data.auditTrail || [];
      data.auditTrail.unshift({
        id: 'AUD-' + Math.floor(1000 + Math.random() * 9000),
        time: 'Just now',
        user: (typeof user === 'object' && user.name) ? user.name : user,
        action: 'Update Operating Policies & Settings',
        ref: 'SETTINGS',
        details: 'Updated fleet operating rules and return match thresholds.'
      });
      this.save(data);
      return { success: true, settings: data.settings };
    },

    getVehicles: function () {
      const data = this.load();
      return (data.vehicles && data.vehicles.length > 0) ? data.vehicles : DEFAULT_VEHICLES;
    },

    getDrivers: function () {
      const data = this.load();
      return (data.drivers && data.drivers.length > 0) ? data.drivers : DEFAULT_DRIVERS;
    },

    getDepartments: function () {
      return DEFAULT_DEPARTMENTS;
    },

    getCostCenterForDepartment: function (deptName) {
      return getCostCenterForDepartment(deptName);
    },

    getPriceBooks: function () {
      return PRICE_BOOKS;
    },

    getPriceBookForDate: function (dateStr) {
      return getPriceBookForDate(dateStr);
    },

    getBookings: function () {
      const data = this.load();
      return data.bookings || [];
    },

    getBooking: function (id) {
      if (!id) return null;
      const bookings = this.getBookings();
      return bookings.find(b => b.id === id) || null;
    },

    calculateOvernightNights: function (booking) {
      return calculateOvernightNights(booking);
    },

    calculateDeadheadLeg: function (booking, vehicle) {
      if (!booking || !booking.itinerary || booking.itinerary.length === 0) return null;
      const lastPoint = booking.itinerary[booking.itinerary.length - 1];
      const basePlace = (vehicle && vehicle.location) ? vehicle.location : booking.itinerary[0].place_name;
      return calculateDeadheadLeg(lastPoint, basePlace);
    },

    getHoldWindow: function (booking) {
      if (!booking) {
        return {
          start: '2026-10-18T08:00:00+03:00',
          end: '2026-10-18T18:45:00+03:00',
          startDateObj: new Date(),
          endDateObj: new Date(),
          bufferMinutes: 45,
          formatted: '18 Oct 08:00 → 18 Oct 18:45',
          formattedWithBuffer: '18 Oct 08:00 → 18 Oct 18:45 (45m turnaround buffer)'
        };
      }

      const hw = booking.hold_window || calculateHoldWindow(booking);
      const startObj = new Date(hw.start);
      const endObj = new Date(hw.end);

      const sFmt = formatShortDate(hw.start);
      const eFmt = formatShortDate(hw.end);
      const sTime = hw.start.includes('T') ? hw.start.split('T')[1].substring(0, 5) : '08:00';
      const eTime = hw.end.includes('T') ? hw.end.split('T')[1].substring(0, 5) : '18:45';

      const formatted = `${sFmt} ${sTime} → ${eFmt} ${eTime}`;

      return {
        start: hw.start,
        end: hw.end,
        startDateObj: startObj,
        endDateObj: endObj,
        bufferMinutes: hw.buffer_minutes || 45,
        formatted: formatted,
        formattedWithBuffer: `${formatted} (${hw.buffer_minutes || 45}m turnaround buffer)`
      };
    },

    computeDailyDrivingSummary: function (booking) {
      if (!booking) return [];
      const points = Array.isArray(booking.itinerary) ? booking.itinerary : [];
      const legs = Array.isArray(booking.route_legs) ? booking.route_legs : [];
      const settings = this.getSettings();
      const maxHours = (settings.rules && settings.rules.maxDrivingHoursPerDay) || 8.0;
      const maxMins = maxHours * 60;

      const sDate = booking.start_date || '2026-10-18';
      const startMs = new Date(sDate + 'T00:00:00+03:00').getTime();

      const dailyMap = {};

      legs.forEach((leg, idx) => {
        const fromPt = points[idx] || {};
        const rawDate = (fromPt.depart_at || `${sDate}T08:00:00+03:00`).split('T')[0];
        dailyMap[rawDate] = (dailyMap[rawDate] || 0) + (leg.drive_minutes || 0);
      });

      if (booking.deadhead && !booking.return_with_vehicle && points.length > 0) {
        const lastPt = points[points.length - 1];
        const lastArrDate = (lastPt.arrive_at || `${booking.end_date || sDate}T18:00:00+03:00`).split('T')[0];
        dailyMap[lastArrDate] = (dailyMap[lastArrDate] || 0) + (booking.deadhead.drive_minutes || 0);
      }

      if (Object.keys(dailyMap).length === 0) {
        dailyMap[sDate] = 0;
      }

      const summary = [];
      const sortedDates = Object.keys(dailyMap).sort();

      sortedDates.forEach(dateStr => {
        const totalMins = dailyMap[dateStr];
        const h = Math.floor(totalMins / 60);
        const m = totalMins % 60;
        const exceeds = totalMins > maxMins;
        const currentMs = new Date(dateStr + 'T00:00:00+03:00').getTime();
        const dayIndex = Math.max(1, Math.round((currentMs - startMs) / 86400000) + 1);

        summary.push({
          dayIndex: dayIndex,
          date: dateStr,
          dateFormatted: formatShortDate(dateStr),
          driveMinutes: totalMins,
          driveHoursFormatted: `${h}h ${m.toString().padStart(2, '0')}m`,
          exceedsLimit: exceeds,
          notice: exceeds
            ? `Day ${dayIndex} (${formatShortDate(dateStr)}) needs ${h}h ${m.toString().padStart(2, '0')}m driving — assign a second driver.`
            : null
        });
      });

      return summary;
    },

    findReturnMatches: function (bookingB) {
      if (!bookingB) return [];
      const data = this.load();
      const allBookings = data.bookings || [];
      const allVehicles = this.getVehicles();
      const allDrivers = this.getDrivers();
      const settings = this.getSettings();
      const returnRules = (settings.rules && settings.rules.returnMatch) || {
        maxPickupDistanceKm: 15,
        maxWaitHours: 3,
        maxDetourMinutes: 30
      };
      const prepBufferMin = (settings.rules && settings.rules.prepBufferMin) || 30;
      const priceBook = getPriceBookForDate(bookingB.start_date);

      const bDep = Array.isArray(bookingB.itinerary) && bookingB.itinerary[0];
      const bLast = Array.isArray(bookingB.itinerary) && bookingB.itinerary[bookingB.itinerary.length - 1];
      if (!bDep || !bLast) return [];

      const bDepDate = parseDateTimeSafe(bDep.depart_at || bDep.arrive_at, '08:00');
      const bDepMs = bDepDate.getTime();
      const bPax = bookingB.passengers || 1;
      const bCargo = bookingB.has_extra_cargo ? (Number(bookingB.cargo_kg) || 0) : 0;

      let bLegsKm = 0;
      let bLegsMinutes = 0;
      if (Array.isArray(bookingB.route_legs) && bookingB.route_legs.length > 0) {
        bookingB.route_legs.forEach(l => {
          bLegsKm += (l.distance_km || 0);
          bLegsMinutes += (l.drive_minutes || 0);
        });
      } else {
        const estLeg = RouteEstimator.estimateLeg(bDep, bLast, 'Van');
        bLegsKm = estLeg.distanceKm;
        bLegsMinutes = estLeg.driveMinutes;
      }

      const matches = [];

      allBookings.forEach(bookingA => {
        if (bookingA.id === bookingB.id) return;
        if (!['Approved', 'Dispatched'].includes(bookingA.status)) return;
        if (!bookingA.assignment || !bookingA.assignment.vehicle_id) return;
        if (bookingA.assignment.deadhead_used_by) return;
        if (!bookingA.deadhead || !bookingA.deadhead.distance_km) return;

        const aLast = Array.isArray(bookingA.itinerary) && bookingA.itinerary[bookingA.itinerary.length - 1];
        if (!aLast) return;

        const vA = allVehicles.find(v => v.code === bookingA.assignment.vehicle_id);
        if (!vA || ['Maintenance', 'Out of service', 'Decommissioned'].includes(vA.status)) return;

        if (vA.seats < bPax) return;
        if (bCargo > 0 && vA.payloadKg < bCargo) return;

        const homeSiteA = (vA.home_site_id ? this.getSite(vA.home_site_id) : null) || findLocationByName(vA.location);
        const homeSiteName = homeSiteA ? homeSiteA.name : (vA.location || 'Base');

        let pickupDistKm = 0;
        let pickupMinutes = 0;
        if (typeof aLast.lat === 'number' && typeof bDep.lat === 'number') {
          const directKm = calculateHaversineKm(aLast.lat, aLast.lng, bDep.lat, bDep.lng);
          pickupDistKm = directKm < 0.25 ? 0 : Math.round(directKm * 1.25 * 10) / 10;
        } else {
          const aLastName = (aLast.place_name || '').toLowerCase();
          const bDepName = (bDep.place_name || '').toLowerCase();
          if (aLastName === bDepName || aLastName.includes(bDepName) || bDepName.includes(aLastName)) {
            pickupDistKm = 0;
          } else {
            const legEst = RouteEstimator.estimateLeg(aLast, bDep, vA.category);
            pickupDistKm = legEst.distanceKm;
          }
        }

        if (pickupDistKm > returnRules.maxPickupDistanceKm) return;
        pickupMinutes = Math.round(pickupDistKm * 1.5);

        const aLastDate = parseDateTimeSafe(aLast.arrive_at || aLast.depart_at, '18:00');
        const earliestPickupMs = aLastDate.getTime() + (prepBufferMin * 60000);
        const latestPickupMs = earliestPickupMs + (returnRules.maxWaitHours * 3600000);

        if (bDepMs < earliestPickupMs || bDepMs > latestPickupMs) return;

        const waitTimeMinutes = Math.max(0, Math.round((bDepMs - earliestPickupMs) / 60000));

        const plainDeadheadKm = bookingA.deadhead.distance_km;
        const plainDeadheadMinutes = bookingA.deadhead.drive_minutes;

        let newDeadheadB = null;
        let bEndToHomeKm = 0;
        let bEndToHomeMinutes = 0;

        const bLastPlace = (bLast.place_name || '').toLowerCase();
        const homePlace = homeSiteName.toLowerCase();
        const endsNearHome = Boolean(homeSiteA && (
          bLastPlace.includes(homePlace) || homePlace.includes(bLastPlace) ||
          (homeSiteA.city && bLastPlace.includes(homeSiteA.city.toLowerCase()))
        ));

        if (!endsNearHome) {
          newDeadheadB = calculateDeadheadLeg(bLast, homeSiteName);
          if (newDeadheadB) {
            bEndToHomeKm = newDeadheadB.distance_km;
            bEndToHomeMinutes = newDeadheadB.drive_minutes;
          }
        }

        const totalReturnMinutes = pickupMinutes + bLegsMinutes + bEndToHomeMinutes;
        const detourMinutes = Math.max(0, totalReturnMinutes - plainDeadheadMinutes);

        if (!endsNearHome && detourMinutes > returnRules.maxDetourMinutes) return;

        const primaryDriverId = bookingA.assignment.driver_ids && bookingA.assignment.driver_ids[0];
        const driverA = allDrivers.find(d => d.id === primaryDriverId);
        let assignedDriver = driverA;
        let sameDriver = true;
        let driverNote = null;

        if (driverA) {
          const aSummary = this.computeDailyDrivingSummary(bookingA);
          const aMinutes = aSummary.reduce((acc, row) => acc + row.minutes, 0);
          const combinedMinutes = aMinutes + pickupMinutes + bLegsMinutes + bEndToHomeMinutes;
          const maxDriveMins = ((settings.rules && settings.rules.maxDrivingHoursPerDay) || 8.0) * 60;

          if (combinedMinutes > maxDriveMins) {
            const altDriver = allDrivers.find(d =>
              d.id !== driverA.id &&
              d.status === 'Available' &&
              d.licenseClass && !d.licenseClass.includes('Class 3')
            );
            if (altDriver) {
              assignedDriver = altDriver;
              sameDriver = false;
              driverNote = `Requires local driver exchange at ${aLast.place_name} (daily limit reached)`;
            } else {
              sameDriver = false;
              driverNote = `Driver daily limit reached; relay driver required at ${aLast.place_name}`;
            }
          }
        }

        let kmSaved = plainDeadheadKm;
        if (pickupDistKm > 0 || bEndToHomeKm > 0) {
          kmSaved = Math.max(10, Math.round(plainDeadheadKm - (pickupDistKm + bEndToHomeKm)));
        }
        const nominalRate = vA.ratePer100Km || 10.0;
        const litersSaved = Math.round((kmSaved * (nominalRate / 100)) * 10) / 10;
        let fuelPrice = priceBook.rates.diesel;
        if (vA.fuelType === 'Petrol 92') fuelPrice = priceBook.rates.petrol92;
        else if (vA.fuelType === 'Petrol 95') fuelPrice = priceBook.rates.petrol95;
        else if (vA.fuelType === 'CNG') fuelPrice = priceBook.rates.cng;
        const egpSaved = Math.round(litersSaved * fuelPrice);

        matches.push({
          bookingA: bookingA,
          vehicle: vA,
          driver: assignedDriver,
          sameDriver: sameDriver,
          driverNote: driverNote,
          waitTimeMinutes: waitTimeMinutes,
          detourMinutes: detourMinutes,
          kmSaved: kmSaved,
          litersSaved: litersSaved,
          egpSaved: egpSaved,
          repositioningLeg: {
            from_seq: 0,
            to_seq: 1,
            from_place: aLast.place_name,
            to_place: bDep.place_name,
            distance_km: pickupDistKm,
            drive_minutes: pickupMinutes,
            source: 'route'
          },
          newDeadheadB: newDeadheadB,
          homeSite: homeSiteA
        });
      });

      matches.sort((m1, m2) => {
        if (m1.kmSaved !== m2.kmSaved) return m2.kmSaved - m1.kmSaved;
        return m1.waitTimeMinutes - m2.waitTimeMinutes;
      });

      return matches;
    },

    linkReturnTrip: function (bookingAId, bookingBId, note = '', user = 'Demo Ops Manager (Dispatcher)') {
      const data = this.load();
      const bA = (data.bookings || []).find(b => b.id === bookingAId);
      const bB = (data.bookings || []).find(b => b.id === bookingBId);
      if (!bA) return { success: false, error: `Booking ${bookingAId} not found.` };
      if (!bB) return { success: false, error: `Booking ${bookingBId} not found.` };

      const matches = this.findReturnMatches(bB);
      const match = matches.find(m => m.bookingA.id === bA.id);
      if (!match) {
        return { success: false, error: 'Return match criteria no longer satisfied or time conflict occurred.' };
      }

      const userName = (typeof user === 'object' && user.name) ? user.name : user;
      const v = match.vehicle;
      const drv = match.driver;

      bB.status = 'Approved';
      bB.assignment = {
        vehicle_id: v.code,
        driver_ids: drv ? [drv.id] : (bA.assignment.driver_ids || []),
        approved_by: userName,
        approved_at: toEgyptISOString(new Date()),
        linked_to: bA.id,
        repositioning: match.repositioningLeg
      };

      bA.assignment.deadhead_used_by = bB.id;
      bA.assignment.original_deadhead = bA.deadhead ? JSON.parse(JSON.stringify(bA.deadhead)) : null;
      bA.deadhead = null;

      const settings = this.getSettings();
      const bufferMin = (settings.rules && settings.rules.turnaroundBufferMin) || 45;
      const aLast = bA.itinerary[bA.itinerary.length - 1];
      const aLastArrIso = formatEgyptISO(aLast.arrive_at || `${bA.end_date} 18:00`);
      const aEndMs = new Date(aLastArrIso).getTime() + (bufferMin * 60000);
      const aEndIso = toEgyptISOString(new Date(aEndMs));

      bA.hold_window = {
        start: bA.hold_window ? bA.hold_window.start : toEgyptISOString(new Date(formatEgyptISO(bA.itinerary[0].depart_at))),
        end: aEndIso,
        buffer_minutes: bufferMin
      };

      const bLast = bB.itinerary[bB.itinerary.length - 1];
      const bLastArrIso = formatEgyptISO(bLast.arrive_at || `${bB.end_date} 18:00`);
      const bDeadheadMins = match.newDeadheadB ? match.newDeadheadB.drive_minutes : 0;
      const bEndMs = new Date(bLastArrIso).getTime() + ((bDeadheadMins + bufferMin) * 60000);

      bB.hold_window = {
        start: aEndIso,
        end: toEgyptISOString(new Date(bEndMs)),
        buffer_minutes: bufferMin
      };

      bB.deadhead = match.newDeadheadB || null;

      bA.estimate = calculateBookingEstimate(bA, v);
      bB.estimate = calculateBookingEstimate(bB, v);

      bB.return_match_savings = {
        km_saved: match.kmSaved,
        liters_saved: match.litersSaved,
        egp_saved: match.egpSaved,
        linked_booking_id: bA.id
      };

      bB.history.push({
        status: 'Approved',
        at: toEgyptISOString(new Date()),
        by: userName,
        note: note || `Approved (return match with ${bA.id})`
      });
      bA.history.push({
        status: bA.status,
        at: toEgyptISOString(new Date()),
        by: userName,
        note: `Return used by ${bB.id}`
      });

      data.auditTrail = data.auditTrail || [];
      data.auditTrail.unshift({
        id: 'AUD-' + Math.floor(1000 + Math.random() * 9000),
        time: 'Just now',
        user: userName,
        action: 'Link Return Match',
        ref: `${bB.id} ↔ ${bA.id}`,
        details: `Assigned vehicle ${v.code} on empty return from ${bA.id} to ${bB.id}. Saved ${match.kmSaved} km / ${match.litersSaved} L.`
      });

      data.notifications = data.notifications || [];
      data.notifications.unshift({
        id: 'NOTIF-' + Math.floor(1000 + Math.random() * 9000),
        time: 'Just now',
        title: 'Return Trip Optimization',
        message: `Booking ${bB.id} has been approved using vehicle ${v.code} on its return leg. Avoided ${match.kmSaved} km of empty deadhead.`,
        role: 'Operations',
        read: false
      });
      data.notifications.unshift({
        id: 'NOTIF-' + Math.floor(1000 + Math.random() * 9000),
        time: 'Just now',
        title: 'Booking Approved',
        message: `Your booking ${bB.id} has been approved. Your trip uses a vehicle already in the area.`,
        role: 'Requester',
        read: false
      });

      this.save(data);
      return { success: true, bookingA: bA, bookingB: bB, match: match };
    },

    unlinkReturnTrip: function (bookingBId, reason = 'Operations unlink', user = 'Demo Ops Manager (Dispatcher)') {
      const data = this.load();
      const bB = (data.bookings || []).find(b => b.id === bookingBId);
      if (!bB) return { success: false, error: 'Booking not found.' };
      if (!bB.assignment || !bB.assignment.linked_to) {
        return { success: false, error: 'Booking is not linked to a return match.' };
      }

      const linkedAId = bB.assignment.linked_to;
      const bA = (data.bookings || []).find(b => b.id === linkedAId);
      const userName = (typeof user === 'object' && user.name) ? user.name : user;

      bB.status = 'Pending';
      bB.assignment = null;
      bB.return_match_savings = null;
      bB.deadhead = null;
      bB.hold_window = calculateHoldWindow(bB, null);
      bB.estimate = calculateBookingEstimate(bB, null);
      bB.history.push({
        status: 'Pending',
        at: toEgyptISOString(new Date()),
        by: userName,
        note: `Unlinked from ${linkedAId}: ${reason}`
      });

      if (bA) {
        const vA = (data.vehicles || []).find(v => v.code === (bA.assignment && bA.assignment.vehicle_id));
        const homeSite = vA ? this.getSite(vA.home_site_id) : null;
        const vehicleBase = homeSite || (vA ? vA.location : 'Base');

        bA.deadhead = (bA.assignment && bA.assignment.original_deadhead) || calculateDeadheadLeg(bA.itinerary[bA.itinerary.length - 1], vehicleBase);
        if (bA.assignment) {
          delete bA.assignment.deadhead_used_by;
          delete bA.assignment.original_deadhead;
        }

        bA.hold_window = calculateHoldWindow(bA, vehicleBase);
        bA.estimate = calculateBookingEstimate(bA, vA);

        bA.history.push({
          status: bA.status,
          at: toEgyptISOString(new Date()),
          by: userName,
          note: `Return unlinked from ${bookingBId}: ${reason}. Deadhead restored.`
        });
      }

      data.auditTrail = data.auditTrail || [];
      data.auditTrail.unshift({
        id: 'AUD-' + Math.floor(1000 + Math.random() * 9000),
        time: 'Just now',
        user: userName,
        action: 'Unlink Return Match',
        ref: `${bookingBId} ↔ ${linkedAId}`,
        details: `Unlinked return match between ${bookingBId} and ${linkedAId}. Reason: ${reason}`
      });

      data.notifications = data.notifications || [];
      data.notifications.unshift({
        id: 'NOTIF-' + Math.floor(1000 + Math.random() * 9000),
        time: 'Just now',
        title: 'Return Trip Unlinked',
        message: `Booking ${bookingBId} was unlinked from ${linkedAId} and returned to the Pending queue.`,
        role: 'Operations',
        read: false
      });

      this.save(data);
      return { success: true, bookingA: bA, bookingB: bB };
    },

    getEmptyReturnsThisWeek: function () {
      const data = this.load();
      const allBookings = data.bookings || [];
      const allVehicles = this.getVehicles();

      const emptyReturns = [];
      allBookings.forEach(b => {
        if (!['Approved', 'Dispatched'].includes(b.status)) return;
        if (!b.assignment || !b.assignment.vehicle_id) return;
        if (b.assignment.deadhead_used_by) return;
        if (!b.deadhead || !b.deadhead.distance_km) return;

        const v = allVehicles.find(item => item.code === b.assignment.vehicle_id);
        const homeSite = (v && v.home_site_id) ? this.getSite(v.home_site_id) : null;
        const lastPt = Array.isArray(b.itinerary) && b.itinerary[b.itinerary.length - 1];

        emptyReturns.push({
          booking_id: b.id,
          vehicle_code: b.assignment.vehicle_id,
          vehicle_model: v ? v.model : 'Vehicle',
          last_point: lastPt ? lastPt.place_name : 'Destination',
          time_free: lastPt ? (lastPt.arrive_at || lastPt.depart_at) : b.end_date,
          base_site: homeSite ? homeSite.name : (v ? v.location : 'Home Site'),
          deadhead_km: b.deadhead.distance_km,
          deadhead_minutes: b.deadhead.drive_minutes
        });
      });

      return emptyReturns;
    },

    getVehicleEligibility: function (booking) {
      if (!booking) return [];
      const hold = this.getHoldWindow(booking);
      const allVehicles = this.getVehicles();
      const allBookings = this.getBookings();
      const priceBook = getPriceBookForDate(booking.start_date);

      let returnMatches = [];
      try {
        returnMatches = this.findReturnMatches(booking);
      } catch (e) {
        returnMatches = [];
      }

      const pax = booking.passengers || 1;
      const cargoKg = booking.has_extra_cargo ? (Number(booking.cargo_kg) || 0) : 0;

      const depPlace = (Array.isArray(booking.itinerary) && booking.itinerary[0])
        ? (booking.itinerary[0].place_name || '')
        : '';

      const activeBookings = allBookings.filter(b =>
        b.id !== booking.id && ['Approved', 'Dispatched', 'Active'].includes(b.status)
      );

      const evaluated = allVehicles.map(v => {
        const reasons = [];

        if (['Maintenance', 'Out of service', 'Decommissioned'].includes(v.status)) {
          if (v.status === 'Maintenance') reasons.push('In maintenance');
          else reasons.push(v.status);
        }

        if (v.seats < pax) {
          reasons.push(`Only ${v.seats} seats (need ${pax})`);
        }

        if (cargoKg > 0 && v.payloadKg < cargoKg) {
          reasons.push(`Payload ${v.payloadKg.toLocaleString()} kg < ${cargoKg.toLocaleString()} kg`);
        }

        const returnMatch = returnMatches.find(m => m.vehicle && m.vehicle.code === v.code);
        const isPotentialReturnMatch = Boolean(returnMatch);

        const conflictingBooking = activeBookings.find(other => {
          const assignedCode = other.assignment ? other.assignment.vehicle_id : null;
          if (assignedCode !== v.code) return false;
          if (isPotentialReturnMatch && returnMatch.bookingA && returnMatch.bookingA.id === other.id) {
            return false;
          }
          const otherHold = this.getHoldWindow(other);
          return hold.startDateObj < otherHold.endDateObj && hold.endDateObj > otherHold.startDateObj;
        });

        if (conflictingBooking) {
          const sRange = formatShortRange(conflictingBooking.start_date, conflictingBooking.end_date);
          reasons.push(`Busy ${sRange} (${conflictingBooking.id})`);
        }

        let repositioningKm = 0;
        const homeSite = (v.home_site_id ? this.getSite(v.home_site_id) : null) || findLocationByName(v.location);
        const homeSiteName = homeSite ? homeSite.name : (v.location || 'Unknown Base');

        const depPoint = (Array.isArray(booking.itinerary) && booking.itinerary[0]) ? booking.itinerary[0] : null;
        const depPlace = depPoint ? (depPoint.place_name || '') : '';
        const depPlaceLower = depPlace.trim().toLowerCase();
        const homeNameLower = homeSiteName.trim().toLowerCase();

        const isExactSameSite = Boolean(homeSite && (
          depPlaceLower === homeNameLower ||
          (homeSite.id && depPoint.site_id === homeSite.id) ||
          (typeof homeSite.lat === 'number' && depPoint && typeof depPoint.lat === 'number' &&
            calculateHaversineKm(homeSite.lat, homeSite.lng, depPoint.lat, depPoint.lng) < 0.25)
        ));

        if (isPotentialReturnMatch && returnMatch.repositioningLeg && reasons.length === 0) {
          repositioningKm = returnMatch.repositioningLeg.distance_km;
        } else if (isExactSameSite) {
          repositioningKm = 0;
        } else if (homeSite) {
          const distKey = `${homeSite.name}|${depPlace}`;
          const reverseKey = `${depPlace}|${homeSite.name}`;
          if (KNOWN_DISTANCES[distKey]) {
            repositioningKm = KNOWN_DISTANCES[distKey].km;
          } else if (KNOWN_DISTANCES[reverseKey]) {
            repositioningKm = KNOWN_DISTANCES[reverseKey].km;
          } else if (typeof homeSite.lat === 'number' && depPoint && typeof depPoint.lat === 'number') {
            const straight = calculateHaversineKm(homeSite.lat, homeSite.lng, depPoint.lat, depPoint.lng);
            repositioningKm = straight < 0.25 ? 0 : Math.round(straight * 1.25 * 10) / 10;
          } else {
            const homeCity = (homeSite.city || '').toLowerCase();
            if (homeCity && depPlaceLower.includes(homeCity)) {
              repositioningKm = 10.0;
            } else {
              repositioningKm = (homeNameLower.includes('cairo') && depPlaceLower.includes('assiut')) ? 380 :
                (homeNameLower.includes('assiut') && depPlaceLower.includes('cairo')) ? 380 :
                (homeNameLower.includes('alexandria') && depPlaceLower.includes('cairo')) ? 218 :
                (homeNameLower.includes('cairo') && depPlaceLower.includes('alexandria')) ? 218 : 50;
            }
          }
        }

        let fuelPrice = priceBook.rates.diesel;
        if (v.fuelType === 'Petrol 92') fuelPrice = priceBook.rates.petrol92;
        else if (v.fuelType === 'Petrol 95') fuelPrice = priceBook.rates.petrol95;
        else if (v.fuelType === 'CNG') fuelPrice = priceBook.rates.cng;

        const loadFactor = (cargoKg > 200 && v.payloadKg > 0)
          ? (1.0 + Math.min(0.3, (cargoKg / v.payloadKg) * 0.15))
          : 1.0;

        let legsKm = 0;
        if (Array.isArray(booking.route_legs)) {
          booking.route_legs.forEach(l => { legsKm += (l.distance_km || 0); });
        }
        const deadheadDist = (!booking.return_with_vehicle)
          ? ((booking.deadhead && booking.deadhead.distance_km) || 0)
          : 0;

        const baseDistKm = legsKm;
        const totalKm = Math.round((baseDistKm + deadheadDist + repositioningKm) * 10) / 10;
        const nominal = v.ratePer100Km || 10.0;
        const fuelLiters = Math.round((totalKm * (nominal / 100) * loadFactor) * 10) / 10;
        const costEGP = Math.round(fuelLiters * fuelPrice * 100) / 100;

        return {
          vehicle: v,
          eligible: reasons.length === 0,
          reasons: reasons,
          isReturnMatch: Boolean(isPotentialReturnMatch && reasons.length === 0),
          returnMatch: isPotentialReturnMatch ? returnMatch : null,
          estimate: {
            distanceKm: baseDistKm,
            deadheadKm: deadheadDist,
            repositioningKm: repositioningKm,
            totalKm: totalKm,
            fuelLiters: fuelLiters,
            costEGP: costEGP,
            loadFactor: loadFactor,
            fuelPrice: fuelPrice,
            fuelType: v.fuelType,
            nominalRate: nominal,
            homeSite: homeSite,
            homeSiteName: homeSiteName,
            isExactSameSite: isExactSameSite
          }
        };
      });

      evaluated.sort((a, b) => {
        if (a.eligible && !b.eligible) return -1;
        if (!a.eligible && b.eligible) return 1;
        if (a.eligible && b.eligible) {
          const aMatch = a.isReturnMatch ? 1 : 0;
          const bMatch = b.isReturnMatch ? 1 : 0;
          if (aMatch !== bMatch) return bMatch - aMatch;

          const aExact = a.estimate.isExactSameSite ? 1 : 0;
          const bExact = b.estimate.isExactSameSite ? 1 : 0;
          if (aExact !== bExact) return bExact - aExact;

          if (a.estimate.repositioningKm !== b.estimate.repositioningKm) {
            return a.estimate.repositioningKm - b.estimate.repositioningKm;
          }

          if (a.estimate.costEGP !== b.estimate.costEGP) {
            return a.estimate.costEGP - b.estimate.costEGP;
          }

          if (a.vehicle.seats !== b.vehicle.seats) return a.vehicle.seats - b.vehicle.seats;
          return a.vehicle.code.localeCompare(b.vehicle.code);
        }
        return a.vehicle.code.localeCompare(b.vehicle.code);
      });

      return evaluated;
    },

    getDriverEligibility: function (booking, vehicleId) {
      if (!booking) return [];
      const hold = this.getHoldWindow(booking);
      const allDrivers = this.getDrivers();
      const allVehicles = this.getVehicles();
      const allBookings = this.getBookings();

      const selectedVehicle = allVehicles.find(v => v.code === vehicleId || v.model === vehicleId) || null;
      const dailySummary = this.computeDailyDrivingSummary(booking);
      const requiresSecondDriver = dailySummary.some(d => d.exceedsLimit);

      const activeBookings = allBookings.filter(b =>
        b.id !== booking.id && ['Approved', 'Dispatched', 'Active'].includes(b.status)
      );

      const evaluated = allDrivers.map(d => {
        const reasons = [];

        if (selectedVehicle) {
          const cat = selectedVehicle.category || selectedVehicle.type;
          if (d.licenseClass.includes('Class 3')) {
            if (cat !== 'Sedan') {
              reasons.push(`License Class 3 cannot drive ${cat}`);
            }
          } else if (d.licenseClass.includes('Class 2')) {
            if (cat === 'Bus' || cat === 'Heavy Cargo Truck' || cat === 'Truck' || cat === 'Heavy Coach') {
              reasons.push(`License Class 2 cannot drive ${cat}`);
            }
          }
        }

        const expDate = parseDateTimeSafe(d.expires, '23:59');
        if (expDate <= hold.endDateObj) {
          reasons.push(`License expired ${formatShortDate(d.expires)}`);
        }

        const conflictingBooking = activeBookings.find(other => {
          const assignedDriverIds = other.assignment ? other.assignment.driver_ids : [];
          return assignedDriverIds.includes(d.id);
        });

        if (conflictingBooking) {
          const sRange = formatShortRange(conflictingBooking.start_date, conflictingBooking.end_date);
          reasons.push(`Assigned to ${conflictingBooking.id} ${sRange}`);
        }

        if (d.status === 'On leave') {
          reasons.push('On leave');
        } else if (d.status.includes('Expired')) {
          reasons.push('Off Duty: Expired license');
        } else if (d.status.includes('Incident')) {
          reasons.push('Suspended: Incident Triage');
        } else if (d.status.includes('Off Duty')) {
          reasons.push('Off duty');
        }

        return {
          driver: d,
          eligible: reasons.length === 0,
          reasons: reasons,
          dailyHours: dailySummary,
          requiresSecondDriver: requiresSecondDriver
        };
      });

      evaluated.sort((a, b) => {
        if (a.eligible && !b.eligible) return -1;
        if (!a.eligible && b.eligible) return 1;
        if (a.eligible && b.eligible) {
          const vehHome = selectedVehicle ? selectedVehicle.home_site_id : null;
          const aHome = (vehHome && a.driver.home_site_id === vehHome) ? 1 : 0;
          const bHome = (vehHome && b.driver.home_site_id === vehHome) ? 1 : 0;
          if (aHome !== bHome) return bHome - aHome;

          return a.driver.name.localeCompare(b.driver.name);
        }
        return a.driver.name.localeCompare(b.driver.name);
      });

      return evaluated;
    },

    listQueue: function (tab = 'pending', search = '', sort = 'trip_start') {
      const allBookings = this.getBookings();
      const settings = this.getSettings();
      const agingHours = (settings.rules && settings.rules.agingThresholdHours) || 4;

      const counts = {
        pending: 0,
        changes: 0,
        approved: 0,
        rejected: 0
      };

      allBookings.forEach(b => {
        if (b.status === 'Pending') counts.pending++;
        else if (b.status === 'Changes requested') counts.changes++;
        else if (b.status === 'Approved') counts.approved++;
        else if (b.status === 'Rejected') counts.rejected++;
      });

      const cleanTab = (tab || 'pending').toLowerCase();
      let filtered = allBookings.filter(b => {
        if (cleanTab === 'pending') return b.status === 'Pending';
        if (cleanTab === 'changes') return b.status === 'Changes requested';
        if (cleanTab === 'approved') return b.status === 'Approved';
        if (cleanTab === 'rejected') return b.status === 'Rejected';
        return true;
      });

      if (search && search.trim()) {
        const q = search.trim().toLowerCase();
        filtered = filtered.filter(b => {
          const idMatch = (b.id || '').toLowerCase().includes(q);
          const reqMatch = (b.requester && b.requester.name && b.requester.name.toLowerCase().includes(q));
          const deptMatch = (b.requester && b.requester.department && b.requester.department.toLowerCase().includes(q));
          const placeMatch = Array.isArray(b.itinerary) && b.itinerary.some(p => (p.place_name || '').toLowerCase().includes(q));
          return idMatch || reqMatch || deptMatch || placeMatch;
        });
      }

      filtered.sort((a, b) => {
        if (sort === 'submitted') {
          const tA = new Date(a.history && a.history[0] ? a.history[0].at : 0).getTime();
          const tB = new Date(b.history && b.history[0] ? b.history[0].at : 0).getTime();
          return tB - tA;
        }
        const startA = a.start_date || '2099-12-31';
        const startB = b.start_date || '2099-12-31';
        if (startA !== startB) return startA.localeCompare(startB);
        const tA = (a.itinerary && a.itinerary[0] && a.itinerary[0].depart_at) || '';
        const tB = (b.itinerary && b.itinerary[0] && b.itinerary[0].depart_at) || '';
        return tA.localeCompare(tB);
      });

      const nowMs = Date.now();
      const items = filtered.map(b => {
        const submittedTime = (b.history && b.history[0] && b.history[0].at) ? new Date(b.history[0].at).getTime() : nowMs;
        const diffHours = Math.max(0, Math.round((nowMs - submittedTime) / 3600000));
        let ageStr = `${diffHours} h ago`;
        if (diffHours < 1) {
          const diffMins = Math.max(1, Math.round((nowMs - submittedTime) / 60000));
          ageStr = `${diffMins} m ago`;
        } else if (diffHours >= 24) {
          ageStr = `${Math.floor(diffHours / 24)} d ago`;
        }

        const isAmber = diffHours >= agingHours;

        const warningChips = [];
        const daily = this.computeDailyDrivingSummary(b);
        const overLimitDay = daily.find(d => d.exceedsLimit);
        if (overLimitDay) {
          warningChips.push({
            type: 'danger',
            label: `Day ${overLimitDay.dayIndex}: ${overLimitDay.driveHoursFormatted} driving`
          });
        }

        const nights = calculateOvernightNights(b);
        if (nights > 0) {
          warningChips.push({
            type: 'info',
            label: `Overnight ×${nights}`
          });
          if (!b.driver_overnight_location || !b.driver_overnight_location.trim()) {
            warningChips.push({
              type: 'warning',
              label: 'Overnight location missing'
            });
          }
        }

        const hasUnpinned = Array.isArray(b.itinerary) && b.itinerary.some(p => p.pinned === false || !p.lat);
        if (hasUnpinned) {
          warningChips.push({
            type: 'warning',
            label: 'Unpinned location'
          });
        }

        const days = RouteEstimator.calculateDaysCount(b.start_date, b.end_date);
        const routeSummary = (b.itinerary && b.itinerary.length > 0)
          ? b.itinerary.map(p => p.place_name).join(' → ')
          : 'Trip Route';

        return {
          booking: b,
          id: b.id,
          requesterName: b.requester ? b.requester.name : 'Requester',
          dept: b.requester ? b.requester.department : 'Department',
          periodStr: `${formatShortRange(b.start_date, b.end_date)} · ${days} day${days > 1 ? 's' : ''}`,
          routeSummary: routeSummary,
          passengers: b.passengers || 1,
          hasCargo: Boolean(b.has_extra_cargo),
          cargoWeight: b.cargo_kg || 0,
          ageStr: ageStr,
          isAmberAge: isAmber,
          warningChips: warningChips
        };
      });

      return {
        items: items,
        counts: counts
      };
    },

    approveBooking: function (id, vehicleId, driverIds, note = '') {
      const data = this.load();
      const b = (data.bookings || []).find(item => item.id === id);
      if (!b) {
        return { success: false, error: `Booking ${id} not found.` };
      }

      const vehicleCode = (typeof vehicleId === 'object' && vehicleId.code) ? vehicleId.code : vehicleId;
      const vEligList = this.getVehicleEligibility(b);
      const vMatch = vEligList.find(item => item.vehicle.code === vehicleCode);

      if (!vMatch || !vMatch.eligible) {
        const conflicting = (data.bookings || []).find(other =>
          other.id !== b.id && other.assignment && other.assignment.vehicle_id === vehicleCode && ['Approved', 'Dispatched', 'Active'].includes(other.status)
        );
        const conflictMsg = conflicting
          ? `Vehicle ${vehicleCode} was just assigned to ${conflicting.id}. Please pick another.`
          : (vMatch ? vMatch.reasons.join(', ') : 'Vehicle unavailable');
        return {
          success: false,
          conflict: true,
          error: conflictMsg
        };
      }

      const dIds = Array.isArray(driverIds) ? driverIds : [driverIds];
      const dEligList = this.getDriverEligibility(b, vehicleCode);

      if (dEligList[0] && dEligList[0].requiresSecondDriver && dIds.length < 2) {
        return {
          success: false,
          error: 'Driving exceeds 8h on Day 1 — a second driver is required'
        };
      }

      const assignedDrivers = [];
      for (const dId of dIds) {
        const dMatch = dEligList.find(item => item.driver.id === dId || item.driver.name === dId);
        if (!dMatch || !dMatch.eligible) {
          const conflicting = (data.bookings || []).find(other =>
            other.id !== b.id && ['Approved', 'Dispatched', 'Active'].includes(other.status) &&
            other.assignment && other.assignment.driver_ids.includes(dId)
          );
          const conflictMsg = conflicting
            ? `Driver ${dMatch ? dMatch.driver.name : dId} was just assigned to ${conflicting.id}. Please pick another.`
            : (dMatch ? dMatch.reasons.join(', ') : 'Driver unavailable');
          return {
            success: false,
            conflict: true,
            error: conflictMsg
          };
        }
        assignedDrivers.push(dMatch.driver);
      }

      b.status = 'Approved';
      b.assignment = {
        vehicle_id: vMatch.vehicle.code,
        driver_ids: assignedDrivers.map(d => d.id),
        approved_by: 'Demo Ops Manager (Dispatcher)',
        approved_at: toEgyptISOString(new Date())
      };

      const homeSite = this.getSite(vMatch.vehicle.home_site_id);
      const vehicleBase = homeSite || vMatch.vehicle.location;

      if (!b.return_with_vehicle && b.itinerary && b.itinerary.length > 0) {
        b.deadhead = calculateDeadheadLeg(b.itinerary[b.itinerary.length - 1], vehicleBase);
      } else {
        b.deadhead = null;
      }

      b.hold_window = calculateHoldWindow(b, vehicleBase);
      b.estimate = calculateBookingEstimate(b, vMatch.vehicle);

      b.history.push({
        status: 'Approved',
        at: toEgyptISOString(new Date()),
        by: 'Demo Ops Manager (Dispatcher)',
        note: note || `Assigned ${vMatch.vehicle.model} (${vMatch.vehicle.code}) with driver ${assignedDrivers.map(d => d.name).join(' & ')}.`
      });

      data.auditTrail = data.auditTrail || [];
      data.auditTrail.unshift({
        id: 'AUD-' + Math.floor(1000 + Math.random() * 9000),
        time: 'Just now',
        user: 'Demo Ops Manager (Dispatcher)',
        action: 'Approve & Assign Vehicle',
        ref: b.id,
        details: `Assigned ${vMatch.vehicle.code} + ${assignedDrivers.map(d => d.name).join(' & ')} for window ${b.hold_window.start} → ${b.hold_window.end}. Fuel estimate: ${b.estimate.fuel_liters} L.`
      });

      this.save(data);
      return { success: true, booking: b };
    },

    rejectBooking: function (id, reasonCode, text) {
      const data = this.load();
      const b = (data.bookings || []).find(item => item.id === id);
      if (!b) return { success: false, error: 'Booking not found' };

      if (b.assignment && b.assignment.deadhead_used_by) {
        const linkedBId = b.assignment.deadhead_used_by;
        this.unlinkReturnTrip(linkedBId, `Preceding trip ${id} was rejected or cancelled`, 'Demo Ops Manager (Dispatcher)');
      }
      if (b.assignment && b.assignment.linked_to) {
        this.unlinkReturnTrip(b.id, `Trip ${id} was rejected or cancelled`, 'Demo Ops Manager (Dispatcher)');
      }

      const refreshedData = this.load();
      const refreshedB = (refreshedData.bookings || []).find(item => item.id === id) || b;

      refreshedB.status = 'Rejected';
      refreshedB.history.push({
        status: 'Rejected',
        at: toEgyptISOString(new Date()),
        by: 'Demo Ops Manager (Dispatcher)',
        note: `Reason: ${reasonCode || 'Policy'}. Details: ${text || 'Rejected by Operations'}`
      });

      refreshedData.auditTrail = refreshedData.auditTrail || [];
      refreshedData.auditTrail.unshift({
        id: 'AUD-' + Math.floor(1000 + Math.random() * 9000),
        time: 'Just now',
        user: 'Demo Ops Manager (Dispatcher)',
        action: 'Reject Booking',
        ref: id,
        details: `Rejected with reason: "${reasonCode}". Message: ${text}`
      });

      this.save(refreshedData);
      return { success: true, booking: refreshedB };
    },

    requestChanges: function (id, message) {
      const data = this.load();
      const b = (data.bookings || []).find(item => item.id === id);
      if (!b) return { success: false, error: 'Booking not found' };

      b.status = 'Changes requested';
      b.history.push({
        status: 'Changes requested',
        at: toEgyptISOString(new Date()),
        by: 'Demo Ops Manager (Dispatcher)',
        note: message || 'Please adjust your mission schedule or itinerary.'
      });

      data.auditTrail = data.auditTrail || [];
      data.auditTrail.unshift({
        id: 'AUD-' + Math.floor(1000 + Math.random() * 9000),
        time: 'Just now',
        user: 'Demo Ops Manager (Dispatcher)',
        action: 'Request Changes',
        ref: id,
        details: `Sent change request: "${message}"`
      });

      this.save(data);
      return { success: true, booking: b };
    },

    canCancelBooking: function (bookingOrId) {
      const b = typeof bookingOrId === 'string' ? this.getBookingById(bookingOrId) : bookingOrId;
      if (!b) return { allowed: false, reason: 'Booking not found' };
      if (['Dispatched', 'Active', 'Completed', 'Closed'].includes(b.status)) {
        return { allowed: false, reason: 'Trip is already active or completed' };
      }
      if (b.status === 'Rejected') {
        return { allowed: false, reason: 'Booking is already cancelled or rejected' };
      }
      if (b.status === 'Pending' || b.status === 'Changes requested') {
        return { allowed: true };
      }
      if (b.status === 'Approved') {
        const settings = this.getSettings();
        const windowHours = (settings && settings.rules && settings.rules.selfCancelWindowHours) || 2;
        const depTimeStr = (b.itinerary && b.itinerary[0] && b.itinerary[0].depart_at) || `${b.start_date}T08:00:00+03:00`;
        const depTime = new Date(depTimeStr).getTime();
        const diffHours = (depTime - Date.now()) / (1000 * 3600);
        if (diffHours < windowHours) {
          return {
            allowed: false,
            reason: `Self-cancellation locked within ${windowHours} hours of departure (${Math.max(0, Math.round(diffHours * 10) / 10)}h remaining). Contact Operations Desk.`
          };
        }
        return { allowed: true };
      }
      return { allowed: false, reason: 'Cancellation not allowed for current status' };
    },

    cancelBooking: function (id, reason, cancelledByUser) {
      const data = this.load();
      const b = (data.bookings || []).find(item => item.id === id);
      if (!b) return { success: false, error: 'Booking not found' };

      const check = this.canCancelBooking(b);
      if (!check.allowed) {
        return { success: false, error: check.reason };
      }

      if (b.assignment && b.assignment.deadhead_used_by) {
        this.unlinkReturnTrip(b.assignment.deadhead_used_by, `Preceding trip ${id} was cancelled by requester`, cancelledByUser || 'Requester');
      }
      if (b.assignment && b.assignment.linked_to) {
        this.unlinkReturnTrip(b.id, `Trip ${id} was cancelled by requester`, cancelledByUser || 'Requester');
      }

      const refreshedData = this.load();
      const refreshedB = (refreshedData.bookings || []).find(item => item.id === id) || b;
      refreshedB.status = 'Rejected';
      refreshedB.rejectionReason = `Cancelled by requester: ${reason || 'User cancelled'}`;
      refreshedB.assignment = null;
      refreshedB.history = refreshedB.history || [];
      refreshedB.history.push({
        status: 'Rejected',
        at: toEgyptISOString(new Date()),
        by: cancelledByUser || 'Requester',
        note: `Cancelled by requester: ${reason || 'User cancelled requisition'}`
      });

      refreshedData.auditTrail = refreshedData.auditTrail || [];
      refreshedData.auditTrail.unshift({
        id: 'AUD-' + Math.floor(1000 + Math.random() * 9000),
        time: 'Just now',
        user: cancelledByUser || 'Requester',
        action: 'Cancel Booking',
        ref: id,
        details: `Cancelled by requester with note: "${reason || 'No reason provided'}"`
      });

      this.save(refreshedData);
      return { success: true, booking: refreshedB };
    },

    dispatchBooking: function (id) {
      const data = this.load();
      const b = (data.bookings || []).find(item => item.id === id);
      if (!b) return { success: false, error: 'Booking not found' };

      b.status = 'Dispatched';
      b.history.push({
        status: 'Dispatched',
        at: toEgyptISOString(new Date()),
        by: 'Demo Ops Manager (Dispatcher)',
        note: `Dispatched vehicle ${b.assignment ? b.assignment.vehicle_id : 'TBD'}.`
      });

      data.auditTrail = data.auditTrail || [];
      data.auditTrail.unshift({
        id: 'AUD-' + Math.floor(1000 + Math.random() * 9000),
        time: 'Just now',
        user: 'Demo Ops Manager (Dispatcher)',
        action: 'Dispatch Mission',
        ref: id,
        details: `Dispatched ${b.id}.`
      });

      this.save(data);
      return { success: true, booking: b };
    },

    createBooking: function (payload) {
      const data = this.load();
      if (!data.bookings) data.bookings = [];
      if (!data.auditTrail) data.auditTrail = [];

      const nextNumericId = getNextNumericId(data.bookings);
      const newId = `BK-${nextNumericId}`;

      if (data.bookings.some(b => b.id === newId)) {
        throw new Error(`Data integrity violation: ID ${newId} already exists in store.`);
      }

      const rawBooking = {
        id: newId,
        status: 'Pending',
        requester: payload.requester || {
          id: 'USR-REQ-101',
          name: payload.requesterName || 'Demo Requester 1',
          department: payload.dept || 'Faculty of Pharmacy'
        },
        cost_center: payload.cost_center || getCostCenterForDepartment(payload.dept || (payload.requester && payload.requester.department)),
        start_date: payload.start_date || '2026-10-18',
        end_date: payload.end_date || '2026-10-22',
        return_with_vehicle: (payload.return_with_vehicle !== undefined) ? Boolean(payload.return_with_vehicle) : true,
        itinerary: payload.itinerary || [],
        route_legs: payload.route_legs || [],
        deadhead: null,
        passengers: Number(payload.passengers || 1),
        has_extra_cargo: Boolean(payload.has_extra_cargo),
        cargo_kg: payload.has_extra_cargo ? (Number(payload.cargo_kg) || 0) : 0,
        cargo_description: payload.has_extra_cargo ? String(payload.cargo_description || '') : '',
        cargo_flags: payload.cargo_flags || { fragile: false, strap: false, loading_help: false },
        driver_overnight_location: String(payload.driver_overnight_location || ''),
        notes_for_dispatch: String(payload.notes_for_dispatch || payload.notes || ''),
        assignment: null,
        hold_window: null,
        estimate: null,
        history: [
          {
            status: 'Submitted',
            at: toEgyptISOString(new Date()),
            by: `${(payload.requester && payload.requester.name) || payload.requesterName || 'Demo Requester 1'} (Requester)`,
            note: 'Initial booking request submitted'
          }
        ],
        messages: []
      };

      const newBooking = migrateBooking(rawBooking, data.vehicles, data.drivers);

      data.bookings.unshift(newBooking);

      data.auditTrail.unshift({
        id: 'AUD-' + Math.floor(1000 + Math.random() * 9000),
        time: 'Just now',
        user: newBooking.requester.name + ' (Requester)',
        action: 'Submit Itinerary Booking',
        ref: newId,
        details: `Created itinerary booking (${newBooking.itinerary.length} points, ${newBooking.hold_window.start} → ${newBooking.hold_window.end}).`
      });

      this.save(data);
      return newBooking;
    },

    addBookingMessage: function (id, msg) {
      const data = this.load();
      const b = (data.bookings || []).find(item => item.id === id);
      if (!b) return null;
      if (!b.messages) b.messages = [];
      const messageObj = {
        sender: msg.sender || 'requester',
        senderName: msg.senderName || b.requester.name || 'Requester',
        time: toEgyptISOString(new Date()),
        text: msg.text || ''
      };
      b.messages.push(messageObj);
      this.save(data);
      return messageObj;
    },

    updateBookingItinerary: function (id, itineraryPayload) {
      const data = this.load();
      const b = data.bookings.find(item => item.id === id);
      if (!b) return null;

      const wasApproved = (b.status === 'Dispatched' || b.status === 'Active' || b.status === 'Approved');
      const wasChangesRequested = (b.status === 'Changes requested');

      if (itineraryPayload.itinerary) b.itinerary = itineraryPayload.itinerary;
      if (itineraryPayload.route_legs) b.route_legs = itineraryPayload.route_legs;
      if (itineraryPayload.start_date) b.start_date = itineraryPayload.start_date.split('T')[0];
      if (itineraryPayload.end_date) b.end_date = itineraryPayload.end_date.split('T')[0];
      if (itineraryPayload.return_with_vehicle !== undefined) {
        b.return_with_vehicle = Boolean(itineraryPayload.return_with_vehicle);
      }
      if (itineraryPayload.driver_overnight_location !== undefined) {
        b.driver_overnight_location = String(itineraryPayload.driver_overnight_location);
      }
      if (itineraryPayload.passengers !== undefined) {
        b.passengers = Number(itineraryPayload.passengers);
      }
      if (itineraryPayload.has_extra_cargo !== undefined) {
        b.has_extra_cargo = Boolean(itineraryPayload.has_extra_cargo);
      }
      if (itineraryPayload.cargo_kg !== undefined) {
        b.cargo_kg = b.has_extra_cargo ? (Number(itineraryPayload.cargo_kg) || 0) : 0;
      }
      if (itineraryPayload.cargo_description !== undefined) {
        b.cargo_description = b.has_extra_cargo ? String(itineraryPayload.cargo_description) : '';
      }
      if (itineraryPayload.cargo_flags !== undefined) {
        b.cargo_flags = itineraryPayload.cargo_flags;
      }
      if (itineraryPayload.notes_for_dispatch !== undefined) {
        b.notes_for_dispatch = String(itineraryPayload.notes_for_dispatch);
      }

      if (wasApproved || wasChangesRequested) {
        b.status = 'Pending';
        b.assignment = null;
      }

      const updatedCanonical = migrateBooking(b, data.vehicles, data.drivers);
      const index = data.bookings.findIndex(item => item.id === id);
      data.bookings[index] = updatedCanonical;

      data.auditTrail = data.auditTrail || [];
      data.auditTrail.unshift({
        id: 'AUD-' + Math.floor(1000 + Math.random() * 9000),
        time: 'Just now',
        user: updatedCanonical.requester.name + ' (Requester)',
        action: wasApproved ? 'Modify Itinerary (Reset to Pending)' : (wasChangesRequested ? 'Resubmit Modified Itinerary' : 'Update Itinerary'),
        ref: id,
        details: 'Updated itinerary points. Reset to Pending for Operations review.'
      });

      this.save(data);
      return updatedCanonical;
    },

    startTrip: function (id, driverName = 'Driver') {
      return this.startTripWithOdometer(id, {
        odometer_km: 0,
        photo_id: null,
        note: 'Direct start'
      }, driverName);
    },

    startTripWithOdometer: function (id, payload = {}, driverName = 'Driver') {
      const data = this.load();
      const b = data.bookings.find(item => item.id === id);
      if (!b) return null;

      const odoKm = Number(payload.odometer_km !== undefined ? payload.odometer_km : (payload.odo || 0));
      const photoId = payload.photo_id || payload.start_odometer_photo_id || null;
      const note = payload.note || payload.start_odometer_note || '';

      const vCode = b.assignment ? b.assignment.vehicle_id : null;
      const v = vCode ? (data.vehicles || []).find(veh => veh.code === vCode || veh.id === vCode) : null;
      const lastOdo = v ? Number(v.last_odometer_km !== undefined ? v.last_odometer_km : (v.odo || 0)) : 0;
      const diff = odoKm - lastOdo;

      if (v && (diff < 0 || diff > 500) && !note && odoKm > 0) {
        throw new Error(`Odometer discrepancy (${lastOdo} -> ${odoKm} km, diff ${diff} km) requires an explanatory note.`);
      }

      b.status = 'Active';
      b.start_odometer_km = odoKm;
      b.start_odometer_photo_id = photoId;
      b.start_odometer_note = note;
      b.actualOdoStart = odoKm;

      if (v) {
        v.status = 'On trip';
        if (odoKm > 0) {
          v.last_odometer_km = odoKm;
          v.odo = odoKm;
        }
      }

      if (Array.isArray(b.itinerary) && b.itinerary[0]) {
        b.itinerary[0].actual_status = 'Departed';
        b.itinerary[0].actual_time = toEgyptISOString(new Date());
      }

      b.history.push({
        status: 'Active',
        at: toEgyptISOString(new Date()),
        by: driverName,
        note: `Trip started. Verified departure odometer: ${odoKm} km. Live photo: ${photoId || 'None'}${note ? '. Note: ' + note : ''}.`
      });

      data.auditTrail = data.auditTrail || [];
      data.auditTrail.unshift({
        id: 'AUD-' + Math.floor(1000 + Math.random() * 9000),
        time: 'Just now',
        user: driverName,
        action: 'Start Trip & Verify Departure Odometer',
        ref: id,
        details: `Trip started. Departure odometer: ${odoKm} km verified with live photo ${photoId || 'None'}.`
      });

      this.save(data);
      return b;
    },

    advanceTripWaypoint: function (id, stopIndex, actionName, driverName = 'Driver') {
      const data = this.load();
      const b = data.bookings.find(item => item.id === id);
      if (!b) return null;

      if (Array.isArray(b.itinerary) && b.itinerary[stopIndex]) {
        b.itinerary[stopIndex].actual_status = actionName;
        b.itinerary[stopIndex].actual_time = toEgyptISOString(new Date());
      }

      b.history.push({
        status: b.status,
        at: toEgyptISOString(new Date()),
        by: driverName,
        note: `Waypoint #${stopIndex + 1} (${(b.itinerary && b.itinerary[stopIndex] && b.itinerary[stopIndex].place_name) || 'Stop'}): ${actionName}`
      });

      this.save(data);
      return b;
    },

    closeTrip: function (id, payload, driverName = 'Driver') {
      const data = this.load();
      const b = data.bookings.find(item => item.id === id);
      if (!b) return null;

      const startOdo = Number(payload.start_odometer_km !== undefined ? payload.start_odometer_km : (payload.startOdo !== undefined ? payload.startOdo : (payload.odometer_start !== undefined ? payload.odometer_start : (b.start_odometer_km || 0))));
      const endOdo = Number(payload.end_odometer_km !== undefined ? payload.end_odometer_km : (payload.endOdo !== undefined ? payload.endOdo : (payload.odometer_end !== undefined ? payload.odometer_end : startOdo)));
      const kmTravelled = Math.max(0, endOdo - startOdo);
      const fuelLiters = Number(payload.fuelLiters !== undefined ? payload.fuelLiters : (payload.fuelLitres || 0));
      const receiptAmount = Number(payload.receiptAmount !== undefined ? payload.receiptAmount : (payload.cost_egp || 0));
      const endPhotoId = payload.end_odometer_photo_id || null;
      const endNote = payload.end_odometer_note || '';

      b.status = 'Completed';
      b.end_odometer_km = endOdo;
      b.end_odometer_photo_id = endPhotoId;
      b.end_odometer_note = endNote;
      b.actuals = {
        odometer_start: startOdo,
        odometer_end: endOdo,
        km_travelled: kmTravelled,
        fuel_liters: fuelLiters,
        receipt_amount_egp: receiptAmount,
        notes: payload.notes || 'Trip closed by driver',
        end_odometer_photo_id: endPhotoId
      };

      b.history.push({
        status: 'Completed',
        at: toEgyptISOString(new Date()),
        by: driverName,
        note: `Trip completed. Odometer: ${startOdo} → ${endOdo} (${kmTravelled} km). End photo: ${endPhotoId || 'None'}. Fuel added: ${fuelLiters} L. Notes: ${payload.notes || 'None'}.`
      });

      data.auditTrail = data.auditTrail || [];
      data.auditTrail.unshift({
        id: 'AUD-' + Math.floor(1000 + Math.random() * 9000),
        time: 'Just now',
        user: driverName,
        action: 'Close Trip & Submit Actuals',
        ref: id,
        details: `Trip completed with ${kmTravelled} km recorded, return odometer photo ${endPhotoId || 'None'}, and ${fuelLiters} L fuel reported.`
      });

      data.notifications = data.notifications || [];
      data.notifications.unshift({
        id: 'NOTIF-' + Date.now(),
        targetRole: 'Auditor',
        title: `Trip ${id} Completed`,
        message: `${driverName} submitted return odometer photo and fuel receipt for trip ${id}. Ready for compliance audit.`,
        time: 'Just now',
        read: false,
        link: 'audit.html'
      });

      const estLit = (b.estimate && b.estimate.fuel_liters) || b.estFuelLiters || 14.1;
      b.actualFuelLitres = fuelLiters;
      b.actualOdoStart = startOdo;
      b.actualOdoEnd = endOdo;
      b.fuelVariancePct = estLit > 0 ? Number((((fuelLiters - estLit) / estLit) * 100).toFixed(1)) : 0;

      const vCode = (b.assignment && b.assignment.vehicle_id) || b.vehicleCode;
      if (vCode) {
        const v = (data.vehicles || []).find(veh => veh.code === vCode || veh.id === vCode);
        if (v) {
          v.status = 'Available';
          if (endOdo > 0) {
            v.last_odometer_km = endOdo;
            v.odo = endOdo;
          }
        }
      }
      if (b.assignment && Array.isArray(b.assignment.driver_ids)) {
        b.assignment.driver_ids.forEach(dId => {
          const drv = (data.drivers || []).find(d => d.id === dId);
          if (drv) drv.status = 'Available';
        });
      }

      this.save(data);
      return b;
    },

    addPassengerEvent: function (id, eventData = {}) {
      const data = this.load();
      const b = data.bookings.find(item => item.id === id);
      if (!b) return null;

      if (eventData.type === 'boarded' && b.status !== 'Active') {
        throw new Error('Requester cannot board before the driver has started the trip.');
      }

      b.passenger_events = b.passenger_events || [];
      const newEvent = {
        id: 'PEV-' + Date.now() + '-' + Math.floor(100 + Math.random() * 900),
        type: eventData.type,
        at: toEgyptISOString(new Date()),
        by: (eventData.user && eventData.user.id) || (b.requester && b.requester.id) || 'USR-REQ-101',
        requester_name: (eventData.user && eventData.user.name) || (b.requester && b.requester.name) || 'Demo Requester 1',
        lat: eventData.lat !== undefined ? eventData.lat : null,
        lng: eventData.lng !== undefined ? eventData.lng : null,
        reason: eventData.reason || '',
        note: eventData.note || '',
        status: 'awaiting_driver'
      };

      b.passenger_events.push(newEvent);

      const typeDisplay = eventData.type === 'boarded'
        ? 'Boarded vehicle'
        : (eventData.type === 'stopped'
          ? `Stopped / got off (${eventData.reason || 'Stop'})`
          : (eventData.type === 'moving'
            ? 'Back in vehicle / moving again'
            : 'Trip finished'));

      const nowTimeStr = new Date().toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });

      b.history.push({
        status: b.status,
        at: toEgyptISOString(new Date()),
        by: `${newEvent.requester_name} (Requester)`,
        note: `Passenger check-in: ${typeDisplay}. Awaiting driver confirmation.`
      });

      data.notifications = data.notifications || [];
      const assignedDriverId = (b.assignment && Array.isArray(b.assignment.driver_ids) && b.assignment.driver_ids[0]) || null;
      data.notifications.unshift({
        id: 'NOTIF-' + Date.now(),
        targetRole: 'Driver',
        driver_id: assignedDriverId,
        title: `Passenger Check-In (${b.id})`,
        message: `${newEvent.requester_name} reports: ${typeDisplay} at ${nowTimeStr}. Please confirm.`,
        time: 'Just now',
        read: false,
        link: `driver-run.html?id=${b.id}`
      });

      this.save(data);
      return newEvent;
    },

    confirmPassengerEvent: function (id, eventId, isConfirmed, driverNote = '', adjustedTime = null) {
      const data = this.load();
      const b = data.bookings.find(item => item.id === id);
      if (!b || !Array.isArray(b.passenger_events)) return null;

      const evt = b.passenger_events.find(e => e.id === eventId);
      if (!evt) return null;

      const driverName = driverNote ? (driverNote.by || 'Demo Driver 01') : 'Demo Driver 01';

      if (isConfirmed) {
        evt.status = 'confirmed';
        evt.confirmed_at = adjustedTime || evt.at;
        evt.driver_note = typeof driverNote === 'string' ? driverNote : (driverNote.note || '');
        evt.confirmed_by = driverName;

        b.history.push({
          status: b.status,
          at: toEgyptISOString(new Date()),
          by: driverName,
          note: `Driver confirmed passenger check-in: ${evt.type} at ${new Date(evt.confirmed_at).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}.`
        });
      } else {
        const noteStr = typeof driverNote === 'string' ? driverNote : (driverNote.note || 'Driver noted status/time mismatch');
        evt.status = 'disputed';
        evt.dispute_note = noteStr;
        evt.disputed_at = toEgyptISOString(new Date());
        evt.disputed_by = driverName;

        b.history.push({
          status: b.status,
          at: toEgyptISOString(new Date()),
          by: driverName,
          note: `FLAGGED DISPUTE: Driver disputed passenger check-in (${evt.type}). Note: ${noteStr}`
        });

        data.notifications = data.notifications || [];
        data.notifications.unshift({
          id: 'NOTIF-' + Date.now(),
          targetRole: 'Dispatcher',
          title: `Disputed Check-In (${b.id})`,
          message: `${driverName} disputed passenger ${evt.type} report: "${noteStr}"`,
          time: 'Just now',
          read: false,
          link: 'audit.html'
        });

        data.notifications.unshift({
          id: 'NOTIF-' + (Date.now() + 1),
          targetRole: 'Auditor',
          title: `Disputed Check-In (${b.id})`,
          message: `Audit flag: Driver disputed passenger ${evt.type} milestone on trip ${b.id}.`,
          time: 'Just now',
          read: false,
          link: 'audit.html'
        });
      }

      data.auditTrail = data.auditTrail || [];
      data.auditTrail.unshift({
        id: 'AUD-' + Math.floor(1000 + Math.random() * 9000),
        time: 'Just now',
        user: driverName,
        action: isConfirmed ? 'Confirm Passenger Check-In' : 'Dispute Passenger Check-In',
        ref: id,
        details: isConfirmed
          ? `Confirmed ${evt.type} event at ${evt.confirmed_at}.`
          : `Disputed ${evt.type} event. Reason/note: ${evt.dispute_note}`
      });

      this.save(data);
      return evt;
    },

    calculatePassengerTimeline: function (events = [], trip = null) {
      if (!Array.isArray(events) || events.length === 0) {
        return {
          segments: [],
          totalMovingMin: 0,
          totalStoppedMin: 0,
          totalMovingStr: '0m',
          totalStoppedStr: '0m',
          stopCount: 0,
          disputedCount: 0,
          disputedEvents: []
        };
      }

      const sorted = [...events].sort((a, b) => new Date(a.confirmed_at || a.at).getTime() - new Date(b.confirmed_at || b.at).getTime());
      const disputedEvents = sorted.filter(e => e.status === 'disputed');

      const segments = [];
      let totalMovingMin = 0;
      let totalStoppedMin = 0;
      let stopCount = 0;

      for (let i = 0; i < sorted.length; i++) {
        const cur = sorted[i];
        const next = sorted[i + 1];
        const curTime = new Date(cur.confirmed_at || cur.at);
        const curTimeStr = curTime.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });

        if (cur.type === 'boarded' || cur.type === 'moving') {
          let endTime = next ? new Date(next.confirmed_at || next.at) : null;
          let isOngoing = false;
          if (!endTime) {
            if (trip && trip.status === 'Active') {
              endTime = new Date();
              isOngoing = true;
            } else {
              endTime = curTime;
            }
          }
          const diffMin = Math.max(1, Math.round((endTime.getTime() - curTime.getTime()) / 60000));
          totalMovingMin += diffMin;
          const endTimeStr = endTime.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
          const durHours = Math.floor(diffMin / 60);
          const durMins = diffMin % 60;
          const durStr = durHours > 0 ? `${durHours}h${durMins.toString().padStart(2, '0')}` : `${durMins}m`;

          segments.push({
            type: 'moving',
            start_str: curTimeStr,
            end_str: isOngoing ? 'Ongoing' : endTimeStr,
            duration_str: durStr,
            duration_min: diffMin,
            status: cur.status,
            display: `Moving ${curTimeStr}–${isOngoing ? 'Ongoing' : endTimeStr} (${durStr})`
          });
        } else if (cur.type === 'stopped') {
          stopCount++;
          let endTime = next ? new Date(next.confirmed_at || next.at) : null;
          let isOngoing = false;
          if (!endTime) {
            if (trip && trip.status === 'Active') {
              endTime = new Date();
              isOngoing = true;
            } else {
              endTime = curTime;
            }
          }
          const diffMin = Math.max(1, Math.round((endTime.getTime() - curTime.getTime()) / 60000));
          totalStoppedMin += diffMin;
          const endTimeStr = endTime.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
          const durHours = Math.floor(diffMin / 60);
          const durMins = diffMin % 60;
          const durStr = durHours > 0 ? `${durHours}h${durMins.toString().padStart(2, '0')}` : `${durMins}m`;
          const reasonLabel = cur.reason ? `, ${cur.reason}` : '';

          segments.push({
            type: 'stopped',
            reason: cur.reason || 'General stop',
            note: cur.note || '',
            start_str: curTimeStr,
            end_str: isOngoing ? 'Ongoing' : endTimeStr,
            duration_str: durStr,
            duration_min: diffMin,
            status: cur.status,
            display: `Stopped ${curTimeStr}–${isOngoing ? 'Ongoing' : endTimeStr} (${durStr}${reasonLabel})`
          });
        }
      }

      function formatDuration(mins) {
        const h = Math.floor(mins / 60);
        const m = mins % 60;
        if (h > 0) return `${h}h ${m}m`;
        return `${m}m`;
      }

      return {
        segments: segments,
        totalMovingMin: totalMovingMin,
        totalStoppedMin: totalStoppedMin,
        totalMovingStr: formatDuration(totalMovingMin),
        totalStoppedStr: formatDuration(totalStoppedMin),
        stopCount: stopCount,
        disputedCount: disputedEvents.length,
        disputedEvents: disputedEvents
      };
    },

    addFuelLog: function (id, logData, driverName = 'Driver') {
      const data = this.load();
      const b = data.bookings.find(item => item.id === id);
      if (!b) return null;

      b.fuel_logs = b.fuel_logs || [];
      const photos = logData.photos || {};

      const fuelLog = {
        id: 'FLOG-' + Date.now(),
        logged_at: toEgyptISOString(new Date()),
        driver: driverName,
        station_name: logData.station_name || 'Service Station',
        liters: Number(logData.liters || 0),
        amount_paid_egp: Number(logData.amount || 0),
        odometer_km: Number(logData.odometer_km || 0),
        lat: logData.lat !== undefined ? logData.lat : null,
        lng: logData.lng !== undefined ? logData.lng : null,
        photos: {
          gauge_before: photos.gauge_before || null,
          pump_display: photos.pump_display || null,
          gauge_after: photos.gauge_after || null,
          receipt: photos.receipt || null,
          odometer: photos.odometer || null
        },
        mismatch_flagged: false,
        mismatch_notes: ''
      };

      b.fuel_logs.push(fuelLog);

      b.history.push({
        status: b.status,
        at: toEgyptISOString(new Date()),
        by: driverName,
        note: `Refuel logged: ${fuelLog.liters} L at ${fuelLog.station_name} (Odo: ${fuelLog.odometer_km} km). 5 live verification photos recorded.`
      });

      data.notifications = data.notifications || [];
      data.notifications.unshift({
        id: 'NOTIF-' + Date.now(),
        targetRole: 'Dispatcher',
        title: `Fuel Added on Trip ${b.id}`,
        message: `${driverName} logged ${fuelLog.liters} L refuel at ${fuelLog.station_name}. All 5 verification photos recorded.`,
        time: 'Just now',
        read: false,
        link: 'audit.html'
      });

      data.auditTrail = data.auditTrail || [];
      data.auditTrail.unshift({
        id: 'AUD-' + Math.floor(1000 + Math.random() * 9000),
        time: 'Just now',
        user: driverName,
        action: 'Log Vehicle Refuel',
        ref: id,
        details: `Logged ${fuelLog.liters} L refuel at ${fuelLog.station_name} with 5 verified photos.`
      });

      this.save(data);
      return fuelLog;
    },

    flagFuelMismatch: function (bookingId, fuelLogId, mismatchNotes = '', auditorName = 'Auditor') {
      const data = this.load();
      const b = data.bookings.find(item => item.id === bookingId);
      if (!b || !Array.isArray(b.fuel_logs)) return null;

      const log = b.fuel_logs.find(fl => fl.id === fuelLogId);
      if (!log) return null;

      log.mismatch_flagged = !log.mismatch_flagged;
      log.mismatch_notes = log.mismatch_flagged ? (mismatchNotes || 'Typed liters differ from pump display photo') : '';
      log.flagged_by = auditorName;
      log.flagged_at = toEgyptISOString(new Date());

      data.auditTrail = data.auditTrail || [];
      data.auditTrail.unshift({
        id: 'AUD-' + Math.floor(1000 + Math.random() * 9000),
        time: 'Just now',
        user: auditorName,
        action: log.mismatch_flagged ? 'Flag Fuel Quantity Mismatch' : 'Clear Fuel Mismatch Flag',
        ref: bookingId,
        details: `Fuel log ${fuelLogId}: ${log.mismatch_flagged ? log.mismatch_notes : 'Mismatch cleared.'}`
      });

      this.save(data);
      return log;
    },

    reconcileTrip: function (id, auditorNotes) {
      const data = this.load();
      const b = data.bookings.find(item => item.id === id);
      if (!b) return null;

      b.status = 'Completed';
      b.reconciled = true;
      b.reconciled_at = toEgyptISOString(new Date());
      b.reconciled_notes = auditorNotes || 'Audit cleared';

      b.history.push({
        status: 'Completed',
        at: toEgyptISOString(new Date()),
        by: 'Demo Auditor (Auditor)',
        note: auditorNotes || 'Cleared fuel variance. Final department chargeback approved.'
      });

      data.auditTrail = data.auditTrail || [];
      data.auditTrail.unshift({
        id: 'AUD-' + Math.floor(1000 + Math.random() * 9000),
        time: 'Just now',
        user: 'Demo Auditor (Auditor)',
        action: 'Audit Reconcile & Settle',
        ref: id,
        details: auditorNotes || 'Cleared fuel variance. Final department chargeback approved.'
      });

      this.save(data);
      return b;
    },

    reportIncident: function (payload) {
      const data = this.load();
      data.incidents = data.incidents || [];

      const incidentId = 'INC-' + Math.floor(1000 + Math.random() * 9000);
      const entry = {
        id: incidentId,
        booking_id: payload.booking_id,
        vehicle_id: payload.vehicle_id,
        type: payload.type || 'Mechanical Breakdown',
        notes: payload.notes || '',
        place_name: payload.place_name || '',
        lat: Number(payload.lat) || 30.0444,
        lng: Number(payload.lng) || 31.2357,
        replacement_vehicle_id: payload.replacement_vehicle_id || null,
        replacement_driver_id: payload.replacement_driver_id || null,
        reported_at: toEgyptISOString(new Date()),
        reported_by: payload.reported_by || 'Demo Ops Manager'
      };

      data.incidents.unshift(entry);

      const b = (data.bookings || []).find(item => item.id === payload.booking_id);
      if (b) {
        if (payload.replacement_vehicle_id) {
          b.assignment = b.assignment || {};
          const prevVehicle = b.assignment.vehicle_id;
          b.assignment.vehicle_id = payload.replacement_vehicle_id;
          if (payload.replacement_driver_id) {
            b.assignment.driver_ids = [payload.replacement_driver_id];
          }
          b.history.push({
            status: b.status,
            at: toEgyptISOString(new Date()),
            by: payload.reported_by || 'Operations',
            note: `Incident ${incidentId} reported (${entry.type}). Assigned replacement vehicle ${payload.replacement_vehicle_id} in place of ${prevVehicle}.`
          });
        } else {
          b.history.push({
            status: b.status,
            at: toEgyptISOString(new Date()),
            by: payload.reported_by || 'Operations',
            note: `Incident ${incidentId} reported: ${entry.type}. ${entry.notes}`
          });
        }
      }

      data.auditTrail = data.auditTrail || [];
      data.auditTrail.unshift({
        id: 'AUD-' + Math.floor(1000 + Math.random() * 9000),
        time: 'Just now',
        user: payload.reported_by || 'Operations',
        action: 'Report Incident & Rescue Triage',
        ref: payload.booking_id,
        details: `Incident ${incidentId} logged on ${payload.vehicle_id}: ${entry.type}. Replacement: ${payload.replacement_vehicle_id || 'None'}.`
      });

      data.notifications = data.notifications || [];
      data.notifications.unshift({
        id: 'NOTIF-' + Date.now(),
        targetRole: 'Dispatcher',
        title: `Incident: ${payload.vehicle_id}`,
        message: `${entry.type} reported on booking ${payload.booking_id}. Rescue action dispatched.`,
        time: 'Just now',
        read: false,
        link: 'incident.html?id=' + payload.booking_id
      });

      this.save(data);
      return entry;
    },

    getDriverShift: function (driverId) {
      const data = this.load();
      data.driverShifts = data.driverShifts || {};
      return data.driverShifts[driverId] || { active: true, startedAt: '07:45', dutyHours: 3.5 };
    },

    startDriverShift: function (driverId, driverName = 'Driver') {
      const data = this.load();
      data.driverShifts = data.driverShifts || {};
      const nowStr = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
      data.driverShifts[driverId] = {
        active: true,
        startedAt: nowStr,
        dutyHours: 0.5
      };

      data.auditTrail = data.auditTrail || [];
      data.auditTrail.unshift({
        id: 'AUD-' + Math.floor(1000 + Math.random() * 9000),
        time: 'Just now',
        user: driverName,
        action: 'Start Duty Shift',
        ref: driverId,
        details: `Driver ${driverName} clocked in for duty shift at ${nowStr}.`
      });

      this.save(data);
      return data.driverShifts[driverId];
    },

    endDriverShift: function (driverId, driverName = 'Driver') {
      const data = this.load();
      data.driverShifts = data.driverShifts || {};
      const cur = data.driverShifts[driverId] || { startedAt: '07:45', dutyHours: 4.0 };
      const nowStr = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
      data.driverShifts[driverId] = {
        active: false,
        startedAt: cur.startedAt,
        endedAt: nowStr,
        dutyHours: cur.dutyHours || 4.5
      };

      data.auditTrail = data.auditTrail || [];
      data.auditTrail.unshift({
        id: 'AUD-' + Math.floor(1000 + Math.random() * 9000),
        time: 'Just now',
        user: driverName,
        action: 'End Duty Shift',
        ref: driverId,
        details: `Driver ${driverName} clocked out of duty shift at ${nowStr}.`
      });

      this.save(data);
      return data.driverShifts[driverId];
    },

    getNotifications: function (targetRole) {
      const data = this.load();
      const list = data.notifications || [];
      if (!targetRole || targetRole === 'all') return list;
      return list.filter(n => !n.targetRole || n.targetRole === targetRole || n.targetRole === 'all');
    },

    markNotificationRead: function (notifId) {
      const data = this.load();
      const notif = (data.notifications || []).find(n => n.id === notifId);
      if (notif) {
        notif.read = true;
        this.save(data);
      }
      return notif;
    },

    markAllNotificationsRead: function (targetRole) {
      const data = this.load();
      (data.notifications || []).forEach(n => {
        if (!targetRole || targetRole === 'all' || n.targetRole === targetRole) {
          n.read = true;
        }
      });
      this.save(data);
      return true;
    }
  };

  if (typeof window !== 'undefined') {
    window.FleetStore = FleetStore;
  }
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = FleetStore;
  }
})();
