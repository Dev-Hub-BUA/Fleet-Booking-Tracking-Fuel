(function () {
  'use strict';

  const STORAGE_KEY = 'cira_fleet_live_store_v3';

  /**
   * Canonical Booking Schema
   *
   * @typedef {Object} RequesterInfo
   * @property {string} id - Requester user ID (e.g. "USR-REQ-101")
   * @property {string} name - Requester full name (e.g. "Dr. Sarah Mansour")
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
      fleetAverageRatePer100Km: 10.0
    },
    contacts: {
      office: 'CIRA Central Logistics Directorate, Campus Admin Bldg, G-14',
      dispatchDesk: 'Ext. 4108 / 4109',
      emergencyHotline: '+20 10 2233 4455',
      email: 'fleet.operations@cira.com.eg',
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

  const DEFAULT_VEHICLES = [
    { code: 'V-122', plate: 'BDR 3307', model: 'Toyota HiAce', year: 2023, category: 'Passenger Van', type: 'Van', seats: 9, payloadKg: 1000, fuelType: 'Diesel', ratePer100Km: 10.0, status: 'Available', location: 'Badr University in Assiut', odo: 48276 },
    { code: 'V-130', plate: 'BDR 4182', model: 'Toyota HiAce', year: 2020, category: 'Passenger Van', type: 'Van', seats: 12, payloadKg: 1200, fuelType: 'Diesel', ratePer100Km: 10.5, status: 'Available', location: 'Badr University in Cairo', odo: 84150 },
    { code: 'V-125', plate: 'BDR 8102', model: 'Toyota HiAce', year: 2023, category: 'Passenger Van', type: 'Van', seats: 12, payloadKg: 1100, fuelType: 'Diesel', ratePer100Km: 10.0, status: 'Available', location: 'Alexandria University / Borg El Arab', odo: 38200 },
    { code: 'S-14', plate: 'BDR 4591', model: 'Hyundai Elantra', year: 2024, category: 'Sedan', type: 'Sedan', seats: 4, payloadKg: 400, fuelType: 'Petrol 92', ratePer100Km: 7.0, status: 'Available', location: 'Alexandria University / Borg El Arab', odo: 21500 },
    { code: 'V-114', plate: 'BDR 2019', model: 'Toyota HiAce', year: 2022, category: 'Passenger Van', type: 'Van', seats: 9, payloadKg: 1100, fuelType: 'Diesel', ratePer100Km: 9.8, status: 'On trip', location: 'Transit to Obour', odo: 62400 },
    { code: 'S-11', plate: 'BDR 1044', model: 'Hyundai Elantra', year: 2024, category: 'Sedan', type: 'Sedan', seats: 4, payloadKg: 400, fuelType: 'Petrol 92', ratePer100Km: 7.1, status: 'Available', location: 'Badr University in Assiut', odo: 18300 },
    { code: 'V-205', plate: 'BDR 5580', model: 'Toyota Corolla', year: 2023, category: 'Sedan', type: 'Sedan', seats: 4, payloadKg: 400, fuelType: 'Petrol 95', ratePer100Km: 6.8, status: 'On trip', location: 'Cairo Airport T3', odo: 32100 },
    { code: 'C-04', plate: 'BDR 7712', model: 'Hyundai Accent', year: 2022, category: 'Sedan', type: 'Sedan', seats: 4, payloadKg: 400, fuelType: 'CNG', ratePer100Km: 7.4, status: 'Available', location: 'Cairo University', odo: 51900 },
    { code: 'B-07', plate: 'BDR 9901', model: 'MCV 500 Coach', year: 2021, category: 'Bus', type: 'Bus', seats: 45, payloadKg: 4000, fuelType: 'Diesel', ratePer100Km: 27.5, status: 'Available', location: 'Badr University in Cairo', odo: 112000 },
    { code: 'T-02', plate: 'BDR 6623', model: 'Isuzu NPR Box Truck', year: 2021, category: 'Heavy Cargo Truck', type: 'Truck', seats: 3, payloadKg: 4500, fuelType: 'Diesel', ratePer100Km: 18.0, status: 'On trip', location: 'Plant 3 — 10th of Ramadan', odo: 95800 },
    { code: 'V-108', plate: 'BDR 1198', model: 'Nissan Urvan', year: 2019, category: 'Passenger Van', type: 'Van', seats: 12, payloadKg: 1150, fuelType: 'Diesel', ratePer100Km: 10.4, status: 'Maintenance', location: 'Central Workshop', odo: 143200 }
  ];

  const DEFAULT_DRIVERS = [
    { id: 'D-101', name: 'Mahmoud Fawzy', licenseClass: 'Class 2 (Professional 2nd)', licenseNo: 'EG-CAI-84920', expires: '2028-03-15', status: 'Available', totalTrips: 412, allowedVehicles: ['Sedan', 'Van', 'Minibus'] },
    { id: 'D-102', name: 'Mostafa Kamel', licenseClass: 'Class 2 (Professional 2nd)', licenseNo: 'EG-GIZ-39102', expires: '2027-11-20', status: 'Available', totalTrips: 345, allowedVehicles: ['Sedan', 'Van', 'Minibus'] },
    { id: 'D-103', name: 'Hany Mahmoud', licenseClass: 'Class 2 (Professional 2nd)', licenseNo: 'EG-CAI-12948', expires: '2027-08-10', status: 'Available', totalTrips: 520, allowedVehicles: ['Sedan', 'Van', 'Minibus'] },
    { id: 'D-104', name: 'Sherif Fathy', licenseClass: 'Class 2 (Professional 2nd)', licenseNo: 'EG-SHR-77291', expires: '2026-09-15', status: 'Off Duty (Expired)', totalTrips: 288, allowedVehicles: ['Sedan', 'Van'] },
    { id: 'D-105', name: 'Sameh Adel', licenseClass: 'Class 3 (Private)', licenseNo: 'EG-CAI-99201', expires: '2029-01-18', status: 'Available', totalTrips: 180, allowedVehicles: ['Sedan only'] },
    { id: 'D-106', name: 'Khaled Soliman', licenseClass: 'Class 2 (Professional 2nd)', licenseNo: 'EG-CAI-66419', expires: '2027-05-30', status: 'Available', totalTrips: 390, allowedVehicles: ['Sedan', 'Van', 'Minibus'] },
    { id: 'D-107', name: 'Walid Saad', licenseClass: 'Class 2 (Professional 2nd)', licenseNo: 'EG-CAI-33820', expires: '2028-09-12', status: 'On leave', totalTrips: 210, allowedVehicles: ['Sedan', 'Van', 'CNG'] },
    { id: 'D-108', name: 'Hassan Metwally', licenseClass: 'Class 1 (Professional 1st)', licenseNo: 'EG-CAI-00192', expires: '2027-12-05', status: 'Available', totalTrips: 640, allowedVehicles: ['Bus', 'Heavy Coach', 'Van', 'Sedan'] },
    { id: 'D-109', name: 'Ibrahim Gamal', licenseClass: 'Class 1 (Professional 1st)', licenseNo: 'EG-SHR-44109', expires: '2028-04-22', status: 'Available', totalTrips: 480, allowedVehicles: ['Truck', 'Van', 'Heavy Cargo'] },
    { id: 'D-110', name: 'Mahmoud Reda', licenseClass: 'Class 1 (Professional 1st)', licenseNo: 'EG-CAI-55219', expires: '2028-07-14', status: 'Suspended: Incident Triage', totalTrips: 310, allowedVehicles: ['Bus', 'Van'] }
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

    const reqId = (raw.requester && raw.requester.id) || 'USR-REQ-101';
    const reqName = (raw.requester && raw.requester.name) || raw.requesterName || 'Dr. Sarah Mansour';
    const reqDept = (raw.requester && raw.requester.department) || raw.dept || 'Faculty of Pharmacy';
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
        approved_by: (raw.assignment && raw.assignment.approved_by) || raw.approved_by || 'Khaled Ibrahim (Dispatcher)',
        approved_at: formatEgyptISO((raw.assignment && raw.assignment.approved_at) || raw.approved_at || raw.createdAt || new Date())
      };
    }

    let deadhead = null;
    if (!return_with_vehicle) {
      if (raw.deadhead && raw.deadhead.to_place) {
        deadhead = {
          from_seq: Number(raw.deadhead.from_seq || itinerary[itinerary.length - 1].sequence),
          to_place: String(raw.deadhead.to_place),
          distance_km: Number(raw.deadhead.distance_km || 0),
          drive_minutes: Number(raw.deadhead.drive_minutes || 0)
        };
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
      messages: messages
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
            name: 'Dr. Sarah Mansour',
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
              by: 'Dr. Sarah Mansour (Requester)',
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
            name: 'Dr. Mahmoud Zaki',
            department: 'Faculty of Science'
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
            approved_by: 'Khaled Ibrahim (Dispatcher)',
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
              by: 'Dr. Mahmoud Zaki (Requester)',
              note: 'Initial booking request submitted'
            },
            {
              status: 'Approved',
              at: '2026-10-18T10:00:00+03:00',
              by: 'Khaled Ibrahim (Dispatcher)',
              note: 'Assigned Toyota HiAce (V-130) with driver Mostafa Kamel'
            }
          ],
          messages: []
        },
        {
          id: 'BK-2048',
          status: 'Changes requested',
          requester: {
            id: 'USR-REQ-103',
            name: 'Dr. Tarek Hegazy',
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
              by: 'Dr. Tarek Hegazy (Requester)',
              note: 'Initial booking request submitted'
            },
            {
              status: 'Changes requested',
              at: '2026-10-18T12:00:00+03:00',
              by: 'Khaled Ibrahim (Dispatcher)',
              note: 'Please adjust departure time from 06:00 to 07:30 to match driver shift availability.'
            }
          ],
          messages: []
        },
        {
          id: 'BK-2049',
          status: 'Rejected',
          requester: {
            id: 'USR-REQ-104',
            name: 'Hossam Nabil',
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
              by: 'Hossam Nabil (Requester)',
              note: 'Initial booking request submitted'
            },
            {
              status: 'Rejected',
              at: '2026-10-18T13:00:00+03:00',
              by: 'Khaled Ibrahim (Dispatcher)',
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
            name: 'Dr. Sarah Mansour',
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
            approved_by: 'Khaled Ibrahim (Dispatcher)',
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
              by: 'Dr. Sarah Mansour (Requester)',
              note: 'Initial booking request submitted'
            },
            {
              status: 'Approved',
              at: '2026-10-11T16:00:00+03:00',
              by: 'Khaled Ibrahim (Dispatcher)',
              note: 'Assigned Toyota Corolla (V-205) with driver Mahmoud Fawzy'
            },
            {
              status: 'Completed',
              at: '2026-10-12T19:15:00+03:00',
              by: 'Khaled Ibrahim (Dispatcher)',
              note: 'Trip reconciled and closed'
            }
          ],
          messages: []
        }
      ],
      auditTrail: [
        {
          id: 'AUD-8801',
          time: 'Today · 08:35',
          user: 'Khaled Ibrahim (Dispatcher)',
          action: 'Approve Multi-Day Itinerary',
          ref: 'BK-2050',
          details: 'Assigned Toyota HiAce (V-130) with Driver Mostafa Kamel for Marine Field Trip.'
        }
      ],
      notifications: [
        {
          id: 'NOTIF-1',
          targetRole: 'Dispatcher',
          title: 'New Booking Awaiting Operations Review',
          message: 'Dr. Sarah Mansour submitted 5-day itinerary BK-2047 (Assiut → Cairo → BUC).',
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
      if (!parsed.vehicles || parsed.vehicles.length === 0) parsed.vehicles = JSON.parse(JSON.stringify(DEFAULT_VEHICLES));
      if (!parsed.drivers || parsed.drivers.length === 0) parsed.drivers = JSON.parse(JSON.stringify(DEFAULT_DRIVERS));

      if (parsed.settings.fuelPrices) {
        parsed.settings.fuelPrices.activeVersion = 'Effective 10 Mar 2026';
        parsed.settings.fuelPrices.rates = {
          diesel: 20.50,
          petrol92: 22.25,
          petrol95: 24.00,
          cng: 13.00
        };
      }

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
          odo: 21500
        });
      }

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

    getSettings: function () {
      const data = this.load();
      return data.settings || DEFAULT_SETTINGS;
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

    getVehicleEligibility: function (booking) {
      if (!booking) return [];
      const hold = this.getHoldWindow(booking);
      const allVehicles = this.getVehicles();
      const allBookings = this.getBookings();
      const priceBook = getPriceBookForDate(booking.start_date);

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

        const conflictingBooking = activeBookings.find(other => {
          const assignedCode = other.assignment ? other.assignment.vehicle_id : null;
          if (assignedCode !== v.code) return false;
          const otherHold = this.getHoldWindow(other);
          return hold.startDateObj < otherHold.endDateObj && hold.endDateObj > otherHold.startDateObj;
        });

        if (conflictingBooking) {
          const sRange = formatShortRange(conflictingBooking.start_date, conflictingBooking.end_date);
          reasons.push(`Busy ${sRange} (${conflictingBooking.id})`);
        }

        let repositioningKm = 0;
        const vLoc = (v.location || '').toLowerCase();
        const dLoc = depPlace.toLowerCase();

        if (vLoc && dLoc && !vLoc.includes(dLoc) && !dLoc.includes(vLoc)) {
          const vKnown = findLocationByName(v.location);
          const dKnown = findLocationByName(depPlace);
          if (vKnown && dKnown) {
            const key = `${vKnown.name}|${dKnown.name}`;
            repositioningKm = KNOWN_DISTANCES[key]
              ? KNOWN_DISTANCES[key].km
              : calculateHaversineKm(vKnown.lat, vKnown.lng, dKnown.lat, dKnown.lng);
          } else {
            repositioningKm = (vLoc.includes('cairo') && dLoc.includes('assiut')) ? 380 : 0;
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
            nominalRate: nominal
          }
        };
      });

      evaluated.sort((a, b) => {
        if (a.eligible && !b.eligible) return -1;
        if (!a.eligible && b.eligible) return 1;
        if (a.eligible && b.eligible) {
          if (a.vehicle.seats !== b.vehicle.seats) return a.vehicle.seats - b.vehicle.seats;
          if (a.vehicle.payloadKg !== b.vehicle.payloadKg) return a.vehicle.payloadKg - b.vehicle.payloadKg;
          return a.estimate.costEGP - b.estimate.costEGP;
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
        approved_by: 'Khaled Ibrahim (Dispatcher)',
        approved_at: toEgyptISOString(new Date())
      };

      if (!b.return_with_vehicle && b.itinerary && b.itinerary.length > 0) {
        b.deadhead = calculateDeadheadLeg(b.itinerary[b.itinerary.length - 1], vMatch.vehicle.location);
      } else {
        b.deadhead = null;
      }

      b.hold_window = calculateHoldWindow(b, vMatch.vehicle.location);
      b.estimate = calculateBookingEstimate(b, vMatch.vehicle);

      b.history.push({
        status: 'Approved',
        at: toEgyptISOString(new Date()),
        by: 'Khaled Ibrahim (Dispatcher)',
        note: note || `Assigned ${vMatch.vehicle.model} (${vMatch.vehicle.code}) with driver ${assignedDrivers.map(d => d.name).join(' & ')}.`
      });

      data.auditTrail = data.auditTrail || [];
      data.auditTrail.unshift({
        id: 'AUD-' + Math.floor(1000 + Math.random() * 9000),
        time: 'Just now',
        user: 'Khaled Ibrahim (Dispatcher)',
        action: 'Approve & Assign Vehicle',
        ref: b.id,
        details: `Assigned ${vMatch.vehicle.code} + ${assignedDrivers.map(d => d.name).join(' & ')} for window ${b.hold_window.start} → ${b.hold_window.end}. Fuel estimate: ${b.estimate.fuel_liters} L (EGP ${b.estimate.cost_egp}).`
      });

      this.save(data);
      return { success: true, booking: b };
    },

    rejectBooking: function (id, reasonCode, text) {
      const data = this.load();
      const b = (data.bookings || []).find(item => item.id === id);
      if (!b) return { success: false, error: 'Booking not found' };

      b.status = 'Rejected';
      b.history.push({
        status: 'Rejected',
        at: toEgyptISOString(new Date()),
        by: 'Khaled Ibrahim (Dispatcher)',
        note: `Reason: ${reasonCode || 'Policy'}. Details: ${text || 'Rejected by Operations'}`
      });

      data.auditTrail = data.auditTrail || [];
      data.auditTrail.unshift({
        id: 'AUD-' + Math.floor(1000 + Math.random() * 9000),
        time: 'Just now',
        user: 'Khaled Ibrahim (Dispatcher)',
        action: 'Reject Booking',
        ref: id,
        details: `Rejected with reason: "${reasonCode}". Message: ${text}`
      });

      this.save(data);
      return { success: true, booking: b };
    },

    requestChanges: function (id, message) {
      const data = this.load();
      const b = (data.bookings || []).find(item => item.id === id);
      if (!b) return { success: false, error: 'Booking not found' };

      b.status = 'Changes requested';
      b.history.push({
        status: 'Changes requested',
        at: toEgyptISOString(new Date()),
        by: 'Khaled Ibrahim (Dispatcher)',
        note: message || 'Please adjust your mission schedule or itinerary.'
      });

      data.auditTrail = data.auditTrail || [];
      data.auditTrail.unshift({
        id: 'AUD-' + Math.floor(1000 + Math.random() * 9000),
        time: 'Just now',
        user: 'Khaled Ibrahim (Dispatcher)',
        action: 'Request Changes',
        ref: id,
        details: `Sent change request: "${message}"`
      });

      this.save(data);
      return { success: true, booking: b };
    },

    dispatchBooking: function (id) {
      const data = this.load();
      const b = (data.bookings || []).find(item => item.id === id);
      if (!b) return { success: false, error: 'Booking not found' };

      b.status = 'Dispatched';
      b.history.push({
        status: 'Dispatched',
        at: toEgyptISOString(new Date()),
        by: 'Khaled Ibrahim (Dispatcher)',
        note: `Dispatched vehicle ${b.assignment ? b.assignment.vehicle_id : 'TBD'}.`
      });

      data.auditTrail = data.auditTrail || [];
      data.auditTrail.unshift({
        id: 'AUD-' + Math.floor(1000 + Math.random() * 9000),
        time: 'Just now',
        user: 'Khaled Ibrahim (Dispatcher)',
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
          name: payload.requesterName || 'Dr. Sarah Mansour',
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
            by: `${(payload.requester && payload.requester.name) || payload.requesterName || 'Dr. Sarah Mansour'} (Requester)`,
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

    startTrip: function (id) {
      const data = this.load();
      const b = data.bookings.find(item => item.id === id);
      if (!b) return null;

      b.status = 'Active';
      b.history.push({
        status: 'Active',
        at: toEgyptISOString(new Date()),
        by: 'Driver',
        note: 'Trip started. Live GPS telemetry streaming to Dispatch Map Hub.'
      });

      data.auditTrail = data.auditTrail || [];
      data.auditTrail.unshift({
        id: 'AUD-' + Math.floor(1000 + Math.random() * 9000),
        time: 'Just now',
        user: 'Driver',
        action: 'Start Trip & GPS Run',
        ref: id,
        details: 'Trip started. Live GPS telemetry streaming to Dispatch Map Hub.'
      });

      this.save(data);
      return b;
    },

    closeTrip: function (id, payload) {
      const data = this.load();
      const b = data.bookings.find(item => item.id === id);
      if (!b) return null;

      b.status = 'Closed';
      b.history.push({
        status: 'Closed',
        at: toEgyptISOString(new Date()),
        by: 'Driver',
        note: `Trip closed. End Odo: ${payload.endOdo || 'Recorded'}. Fuel: ${payload.fuelLitres || 'Recorded'}L.`
      });

      data.auditTrail = data.auditTrail || [];
      data.auditTrail.unshift({
        id: 'AUD-' + Math.floor(1000 + Math.random() * 9000),
        time: 'Just now',
        user: 'Driver',
        action: 'Close Trip & Fuel Receipt',
        ref: id,
        details: 'Trip closed.'
      });

      this.save(data);
      return b;
    },

    reconcileTrip: function (id, auditorNotes) {
      const data = this.load();
      const b = data.bookings.find(item => item.id === id);
      if (!b) return null;

      b.status = 'Completed';
      b.history.push({
        status: 'Completed',
        at: toEgyptISOString(new Date()),
        by: 'Mona Adel (Auditor)',
        note: auditorNotes || 'Cleared fuel variance. Final department chargeback approved.'
      });

      data.auditTrail = data.auditTrail || [];
      data.auditTrail.unshift({
        id: 'AUD-' + Math.floor(1000 + Math.random() * 9000),
        time: 'Just now',
        user: 'Mona Adel (Auditor)',
        action: 'Audit Reconcile & Settle',
        ref: id,
        details: auditorNotes || 'Cleared fuel variance. Final department chargeback approved.'
      });

      this.save(data);
      return b;
    }
  };

  if (typeof window !== 'undefined') {
    window.FleetStore = FleetStore;
  }
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = FleetStore;
  }
})();
