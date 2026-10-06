(function () {
  'use strict';

  const STORAGE_KEY = 'cira_fleet_live_store_v3';

  const DEFAULT_SETTINGS = {
    system: {
      organization: 'CIRA Education',
      portalName: 'Fleet Logistics & Dispatch Platform',
      version: '3.2.0',
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
      maxIdleMinutesAlert: 15
    },
    contacts: {
      office: 'CIRA Central Logistics Directorate, Campus Admin Bldg, G-14',
      dispatchDesk: 'Ext. 4108 / 4109',
      emergencyHotline: '+20 10 2233 4455',
      email: 'fleet.operations@cira.com.eg',
      hours: '24/7 Operations Command & Dispatch'
    },
    fuelPrices: {
      activeVersion: 'v3 (Effective 01 Aug 2026)',
      rates: {
        petrol92: 22.25,
        petrol95: 24.00,
        diesel: 20.50,
        cng: 6.50
      }
    }
  };

  const KNOWN_LOCATIONS = [
    { name: 'Badr University in Assiut', lat: 27.1809, lng: 31.1837, type: 'Campus' },
    { name: 'Cairo University', lat: 30.0276, lng: 31.2089, type: 'Academic' },
    { name: 'Badr University in Cairo', lat: 30.1378, lng: 31.7456, type: 'Campus' },
    { name: 'Ain Shams University', lat: 30.0771, lng: 31.2853, type: 'Academic' },
    { name: 'Supplier Depot — Obour City', lat: 30.2241, lng: 31.4589, type: 'Logistics' },
    { name: 'Plant 3 — 10th of Ramadan', lat: 30.3012, lng: 31.7432, type: 'Industrial' },
    { name: 'Ain Sokhna Marine Research Facility', lat: 29.6012, lng: 32.3211, type: 'Research' },
    { name: 'Alexandria University / Borg El Arab', lat: 31.2001, lng: 29.9187, type: 'Campus' },
    { name: 'Cairo International Airport T3', lat: 30.1114, lng: 31.4065, type: 'Transit' }
  ];

  const KNOWN_DISTANCES = {
    'Badr University in Assiut|Cairo University': { km: 380, mins: 285 },
    'Cairo University|Badr University in Assiut': { km: 380, mins: 285 },
    'Cairo University|Badr University in Cairo': { km: 65, mins: 75 },
    'Badr University in Cairo|Cairo University': { km: 65, mins: 75 },
    'Badr University in Cairo|Badr University in Assiut': { km: 420, mins: 320 },
    'Badr University in Assiut|Badr University in Cairo': { km: 420, mins: 320 },
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
    'Alexandria University / Borg El Arab|Cairo University': { km: 218, mins: 160 }
  };

  const CONSUMPTION_RATES = {
    'Passenger Van': { ratePer100Km: 9.5, fuelPrice: 20.50, fuelType: 'Diesel' },
    'Sedan': { ratePer100Km: 7.0, fuelPrice: 22.25, fuelType: 'Petrol 92' },
    'Bus': { ratePer100Km: 26.0, fuelPrice: 20.50, fuelType: 'Diesel' },
    'Heavy Cargo Truck': { ratePer100Km: 18.0, fuelPrice: 20.50, fuelType: 'Diesel' }
  };

  const DEFAULT_VEHICLES = [
    { code: 'V-122', plate: 'BDR 3307', model: 'Hyundai H-1', year: 2023, category: 'Passenger Van', type: 'Van', seats: 9, payloadKg: 1000, fuelType: 'Diesel', ratePer100Km: 9.2, status: 'Available', location: 'Badr University in Assiut', odo: 48276 },
    { code: 'V-130', plate: 'BDR 4182', model: 'Toyota HiAce', year: 2020, category: 'Passenger Van', type: 'Van', seats: 12, payloadKg: 1200, fuelType: 'Diesel', ratePer100Km: 10.1, status: 'Available', location: 'Badr University in Cairo', odo: 84150 },
    { code: 'V-114', plate: 'BDR 2019', model: 'Toyota HiAce', year: 2022, category: 'Passenger Van', type: 'Van', seats: 9, payloadKg: 1100, fuelType: 'Diesel', ratePer100Km: 9.8, status: 'On trip', location: 'Transit to Obour', odo: 62400 },
    { code: 'S-11', plate: 'BDR 1044', model: 'Hyundai Elantra', year: 2024, category: 'Sedan', type: 'Sedan', seats: 4, payloadKg: 400, fuelType: 'Petrol 92', ratePer100Km: 7.1, status: 'Available', location: 'Badr University in Assiut', odo: 18300 },
    { code: 'V-205', plate: 'BDR 5580', model: 'Toyota Corolla', year: 2023, category: 'Sedan', type: 'Sedan', seats: 4, payloadKg: 400, fuelType: 'Petrol 95', ratePer100Km: 6.8, status: 'On trip', location: 'Cairo Airport T3', odo: 32100 },
    { code: 'C-04', plate: 'BDR 7712', model: 'Hyundai Accent', year: 2022, category: 'Sedan', type: 'Sedan', seats: 4, payloadKg: 400, fuelType: 'CNG', ratePer100Km: 7.4, status: 'Available', location: 'Cairo University', odo: 51900 },
    { code: 'B-07', plate: 'BDR 9901', model: 'MCV 500 Coach', year: 2021, category: 'Bus', type: 'Bus', seats: 45, payloadKg: 4000, fuelType: 'Diesel', ratePer100Km: 27.5, status: 'Available', location: 'Badr University in Cairo', odo: 112000 },
    { code: 'T-02', plate: 'BDR 6623', model: 'Isuzu NPR Box Truck', year: 2021, category: 'Heavy Cargo Truck', type: 'Truck', seats: 3, payloadKg: 4500, fuelType: 'Diesel', ratePer100Km: 18.0, status: 'On trip', location: 'Plant 3 — 10th of Ramadan', odo: 95800 },
    { code: 'V-108', plate: 'BDR 1198', model: 'Nissan Urvan', year: 2019, category: 'Passenger Van', type: 'Van', seats: 12, payloadKg: 1150, fuelType: 'Diesel', ratePer100Km: 10.4, status: 'Maintenance', location: 'Central Workshop', odo: 143200 }
  ];

  const DEFAULT_DRIVERS = [
    { id: 'D-101', name: 'Ahmed Hassan (Driver A)', licenseClass: 'Class 2 (Professional)', licenseNo: 'EG-CAI-84920', expires: '2028-03-15', status: 'On Shift', totalTrips: 412, allowedVehicles: ['Sedan', 'Van', 'Pickup'] },
    { id: 'D-102', name: 'Mostafa Kamel (Driver B)', licenseClass: 'Class 2 (Professional)', licenseNo: 'EG-GIZ-39102', expires: '2027-11-20', status: 'On Shift', totalTrips: 345, allowedVehicles: ['Sedan', 'Van'] },
    { id: 'D-103', name: 'Hany Mahmoud (Driver C)', licenseClass: 'Class 2 (Professional)', licenseNo: 'EG-CAI-12948', expires: '2027-08-10', status: 'On Shift', totalTrips: 520, allowedVehicles: ['Sedan', 'Van'] },
    { id: 'D-104', name: 'Sherif Fathy (Driver D)', licenseClass: 'Class 2 (Professional)', licenseNo: 'EG-SHR-77291', expires: '2026-10-09', status: 'Off Duty (Expired)', totalTrips: 288, allowedVehicles: ['Sedan', 'Van'] },
    { id: 'D-105', name: 'Sameh Adel (Driver E)', licenseClass: 'Class 3 (Private)', licenseNo: 'EG-CAI-99201', expires: '2029-01-18', status: 'On Shift', totalTrips: 180, allowedVehicles: ['Sedan only'] },
    { id: 'D-106', name: 'Khaled Soliman (Driver F)', licenseClass: 'Class 2 (Professional)', licenseNo: 'EG-CAI-66419', expires: '2027-05-30', status: 'On Shift', totalTrips: 390, allowedVehicles: ['Sedan', 'Van'] },
    { id: 'D-107', name: 'Walid Saad (Driver G)', licenseClass: 'Class 2 (Professional)', licenseNo: 'EG-CAI-33820', expires: '2028-09-12', status: 'On Standby', totalTrips: 210, allowedVehicles: ['Sedan', 'Van', 'CNG'] },
    { id: 'D-108', name: 'Hassan Metwally (Driver H)', licenseClass: 'Class 1 (Heavy / Bus)', licenseNo: 'EG-CAI-00192', expires: '2027-12-05', status: 'On Shift', totalTrips: 640, allowedVehicles: ['Bus', 'Heavy Coach', 'Van'] },
    { id: 'D-109', name: 'Ibrahim Gamal (Driver I)', licenseClass: 'Class 1 (Heavy / Truck)', licenseNo: 'EG-SHR-44109', expires: '2028-04-22', status: 'On Shift', totalTrips: 480, allowedVehicles: ['Truck', 'Van', 'Heavy Cargo'] },
    { id: 'D-110', name: 'Mahmoud Reda (Driver K)', licenseClass: 'Class 1 (Heavy / Bus)', licenseNo: 'EG-CAI-55219', expires: '2028-07-14', status: 'Incident Triage', totalTrips: 310, allowedVehicles: ['Bus', 'Van'] }
  ];

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
    const d = new Date(clean + 'T12:00:00');
    if (isNaN(d)) return dateStr;
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    return `${d.getDate()} ${months[d.getMonth()]}`;
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
    const clean = str.trim().replace(' ', 'T');
    const withTime = clean.includes('T') ? clean : `${clean}T${fallbackTime}`;
    const d = new Date(withTime);
    return isNaN(d) ? new Date() : d;
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

      const departIso = fromPoint.depart_at || fromPoint.departureTime;
      const arriveIso = toPoint.arrive_at || toPoint.expectedEnd;

      if (departIso && arriveIso) {
        const depDate = new Date(departIso.replace(' ', 'T'));
        const arrDate = new Date(arriveIso.replace(' ', 'T'));
        const diffMs = arrDate - depDate;
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
        legs.push(this.estimateLeg(points[i], points[i + 1], vehicleCategory, loadFactor));
      }
      return legs;
    },

    calculateDaysCount: function (startDateStr, endDateStr) {
      if (!startDateStr || !endDateStr) return 1;
      const d1 = new Date(startDateStr);
      const d2 = new Date(endDateStr);
      if (isNaN(d1) || isNaN(d2) || d2 < d1) return 1;
      const diffDays = Math.round((d2 - d1) / (1000 * 60 * 60 * 24)) + 1;
      return Math.max(1, diffDays);
    },

    checkDriverRules: function (points, legs) {
      const dailyDriveMap = {};
      legs.forEach((leg, index) => {
        const fromPoint = points[index];
        const dateStr = (fromPoint.depart_at || '').split(' ')[0] || 'Unknown';
        dailyDriveMap[dateStr] = (dailyDriveMap[dateStr] || 0) + leg.drive_minutes;
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

  function getInitialData() {
    const twoHoursAgo = new Date(Date.now() - 2 * 3600 * 1000).toISOString();
    const fiveHoursAgo = new Date(Date.now() - 5 * 3600 * 1000).toISOString();
    const sixHoursAgo = new Date(Date.now() - 6 * 3600 * 1000).toISOString();
    const oneDayAgo = new Date(Date.now() - 24 * 3600 * 1000).toISOString();

    return {
      settings: JSON.parse(JSON.stringify(DEFAULT_SETTINGS)),
      vehicles: JSON.parse(JSON.stringify(DEFAULT_VEHICLES)),
      drivers: JSON.parse(JSON.stringify(DEFAULT_DRIVERS)),
      bookings: [
        {
          id: 'BK-2047',
          route: 'Badr University in Assiut → Cairo University → Badr University in Cairo → Return',
          origin: 'Badr University in Assiut',
          destination: 'Badr University in Cairo',
          startDate: '2026-10-18',
          endDate: '2026-10-22',
          start_date: '2026-10-18',
          end_date: '2026-10-22',
          date: '2026-10-18',
          departureTime: '08:00',
          expectedEnd: '18:00',
          return_with_vehicle: true,
          returnTrip: true,
          returnDate: '2026-10-22',
          returnTime: '18:00',
          vehicleCategory: 'Passenger Van',
          vehicle: 'Pending Allocation',
          vehicleCode: 'TBD',
          driver: 'Pending Assignment',
          passengers: 4,
          has_extra_cargo: true,
          cargo_kg: 350,
          cargoWeightKg: 350,
          cargo_description: '6 boxes of lab equipment, 2 projectors, fragile',
          cargo_flags: {
            fragile: true,
            strap: true,
            loading_help: false
          },
          purpose: 'Official University Delegation Mission & Central Research Symposium',
          notes: 'Delegates traveling with 2 fragile reagent crates; tie-down straps requested.',
          cost_center: 'CC-410 (Faculty of Pharmacy)',
          dept: 'Faculty of Pharmacy',
          requesterName: 'Dr. Sarah Mansour',
          driver_overnight_location: 'BUC Faculty Guesthouse, Badr City',
          distanceKm: 865.0,
          estDriveMinutes: 680,
          estFuelLiters: 82.2,
          estCostEGP: 1685.10,
          holdAmountEGP: 2200.0,
          status: 'Pending',
          statusAr: 'Pending',
          createdAt: twoHoursAgo,
          history: [
            {
              status: 'Submitted',
              at: '18 Oct 2026, 07:15',
              by: 'Dr. Sarah Mansour (Requester)',
              note: 'Initial booking request submitted'
            }
          ],
          messages: [],
          hold_window: {
            start: '2026-10-18 08:00',
            end: '2026-10-22 18:45',
            bufferMinutes: 45
          },
          itinerary: [
            {
              sequence: 1,
              type: 'departure',
              place_name: 'Badr University in Assiut',
              lat: 27.1809,
              lng: 31.1837,
              pinned: true,
              depart_at: '2026-10-18 08:00',
              notes: 'Delegation boarding at Main Administrative Gate'
            },
            {
              sequence: 2,
              type: 'stop',
              place_name: 'Cairo University',
              lat: 30.0276,
              lng: 31.2089,
              pinned: true,
              arrive_at: '2026-10-18 14:30',
              depart_at: '2026-10-18 17:00',
              notes: 'Faculty of Science Lab Meeting'
            },
            {
              sequence: 3,
              type: 'stop',
              place_name: 'Badr University in Cairo',
              lat: 30.1378,
              lng: 31.7456,
              pinned: true,
              arrive_at: '2026-10-19 10:00',
              depart_at: '2026-10-21 16:00',
              notes: 'Symposium & Central Research Lab'
            },
            {
              sequence: 4,
              type: 'return',
              place_name: 'Badr University in Assiut',
              lat: 27.1809,
              lng: 31.1837,
              pinned: true,
              arrive_at: '2026-10-22 18:00',
              notes: 'Return vehicle to central base garage'
            }
          ],
          route_legs: [
            {
              from_seq: 1,
              to_seq: 2,
              from_place: 'Badr University in Assiut',
              to_place: 'Cairo University',
              distance_km: 380,
              drive_minutes: 285,
              fuel_liters: 36.1,
              cost_egp: 740.05,
              warning: null
            },
            {
              from_seq: 2,
              to_seq: 3,
              from_place: 'Cairo University',
              to_place: 'Badr University in Cairo',
              distance_km: 65,
              drive_minutes: 75,
              fuel_liters: 6.2,
              cost_egp: 127.10,
              warning: null
            },
            {
              from_seq: 3,
              to_seq: 4,
              from_place: 'Badr University in Cairo',
              to_place: 'Badr University in Assiut',
              distance_km: 420,
              drive_minutes: 320,
              fuel_liters: 39.9,
              cost_egp: 817.95,
              warning: null
            }
          ]
        },
        {
          id: 'BK-2048',
          route: 'Cairo University → Alexandria University / Borg El Arab',
          origin: 'Cairo University',
          destination: 'Alexandria University / Borg El Arab',
          startDate: '2026-10-24',
          endDate: '2026-10-25',
          start_date: '2026-10-24',
          end_date: '2026-10-25',
          departureTime: '06:00',
          expectedEnd: '16:00',
          return_with_vehicle: false,
          vehicleCategory: 'Sedan',
          vehicle: 'Pending Allocation',
          vehicleCode: 'TBD',
          driver: 'Pending Assignment',
          passengers: 3,
          has_extra_cargo: false,
          cargo_kg: 0,
          cargoWeightKg: 0,
          purpose: 'Academic Accreditation Review',
          dept: 'Faculty of Engineering',
          requesterName: 'Dr. Tarek Hegazy',
          distanceKm: 218.0,
          estDriveMinutes: 160,
          estFuelLiters: 15.3,
          estCostEGP: 340.45,
          status: 'Changes requested',
          statusAr: 'Changes requested',
          changesRequestedMessage: 'Please move departure time from 06:00 to 07:30 to match driver shift availability.',
          changesRequestedBy: 'Khaled Ibrahim (Dispatcher)',
          createdAt: fiveHoursAgo,
          itinerary: [
            { sequence: 1, type: 'departure', place_name: 'Cairo University', lat: 30.0276, lng: 31.2089, pinned: true, depart_at: '2026-10-24 06:00' },
            { sequence: 2, type: 'stop', place_name: 'Alexandria University / Borg El Arab', lat: 31.2001, lng: 29.9187, pinned: true, arrive_at: '2026-10-25 16:00' }
          ]
        },
        {
          id: 'BK-2050',
          route: 'Badr University in Cairo → Ain Sokhna Marine Research Facility',
          origin: 'Badr University in Cairo',
          destination: 'Ain Sokhna Marine Research Facility',
          startDate: '2026-10-19',
          endDate: '2026-10-20',
          start_date: '2026-10-19',
          end_date: '2026-10-20',
          departureTime: '07:00',
          expectedEnd: '18:00',
          return_with_vehicle: true,
          vehicleCategory: 'Passenger Van',
          vehicle: 'Toyota HiAce (V-130)',
          vehicleCode: 'V-130',
          driver: 'Mostafa Kamel (Driver B)',
          assignedDriverIds: ['D-102'],
          passengers: 12,
          has_extra_cargo: false,
          cargo_kg: 0,
          cargoWeightKg: 0,
          purpose: 'Marine Biology Field Study',
          dept: 'Faculty of Science',
          requesterName: 'Dr. Mahmoud Zaki',
          distanceKm: 220.0,
          estDriveMinutes: 170,
          estFuelLiters: 22.2,
          estCostEGP: 455.10,
          status: 'Approved',
          statusAr: 'Approved',
          approved_by: 'Khaled Ibrahim (Dispatcher)',
          approved_at: oneDayAgo,
          createdAt: oneDayAgo,
          hold_window: {
            start: '2026-10-19 07:00',
            end: '2026-10-20 18:45',
            bufferMinutes: 45
          },
          itinerary: [
            { sequence: 1, type: 'departure', place_name: 'Badr University in Cairo', lat: 30.1378, lng: 31.7456, pinned: true, depart_at: '2026-10-19 07:00' },
            { sequence: 2, type: 'stop', place_name: 'Ain Sokhna Marine Research Facility', lat: 29.6012, lng: 32.3211, pinned: true, arrive_at: '2026-10-19 09:30', depart_at: '2026-10-20 15:30' },
            { sequence: 3, type: 'return', place_name: 'Badr University in Cairo', lat: 30.1378, lng: 31.7456, pinned: true, arrive_at: '2026-10-20 18:00' }
          ]
        },
        {
          id: 'BK-2049',
          route: 'Plant 3 — 10th of Ramadan → Supplier Depot — Obour City',
          origin: 'Plant 3 — 10th of Ramadan',
          destination: 'Supplier Depot — Obour City',
          startDate: '2026-10-28',
          endDate: '2026-10-28',
          start_date: '2026-10-28',
          end_date: '2026-10-28',
          departureTime: '09:00',
          expectedEnd: '14:00',
          return_with_vehicle: false,
          vehicleCategory: 'Sedan',
          vehicle: 'None',
          vehicleCode: 'None',
          driver: 'None',
          passengers: 2,
          has_extra_cargo: true,
          cargo_kg: 600,
          cargoWeightKg: 600,
          purpose: 'Courier Cargo Transport',
          dept: 'General Administration',
          requesterName: 'Hossam Nabil',
          distanceKm: 29.4,
          estDriveMinutes: 30,
          estFuelLiters: 2.1,
          estCostEGP: 46.75,
          status: 'Rejected',
          statusAr: 'Rejected',
          rejectionReason: 'Outside policy',
          rejectionText: 'Cargo exceeds standard courier limit and non-official transport is not approved for this cost center.',
          rejected_by: 'Khaled Ibrahim (Dispatcher)',
          rejected_at: sixHoursAgo,
          createdAt: sixHoursAgo,
          itinerary: [
            { sequence: 1, type: 'departure', place_name: 'Plant 3 — 10th of Ramadan', lat: 30.3012, lng: 31.7432, pinned: true, depart_at: '2026-10-28 09:00' },
            { sequence: 2, type: 'stop', place_name: 'Supplier Depot — Obour City', lat: 30.2241, lng: 31.4589, pinned: true, arrive_at: '2026-10-28 14:00' }
          ]
        },
        {
          id: 'BK-2045',
          route: 'BUC Admin Building → Cairo Airport Terminal 3',
          origin: 'BUC Admin Building',
          destination: 'Cairo Airport Terminal 3',
          startDate: '2026-10-12',
          endDate: '2026-10-12',
          start_date: '2026-10-12',
          end_date: '2026-10-12',
          date: '2026-10-12',
          departureTime: '14:00',
          expectedEnd: '17:30',
          return_with_vehicle: false,
          vehicleCategory: 'Sedan',
          vehicle: 'Toyota Corolla (V-205)',
          vehicleCode: 'V-205',
          driver: 'Mahmoud Fawzy',
          passengers: 2,
          has_extra_cargo: false,
          cargo_kg: 0,
          cargoWeightKg: 0,
          purpose: 'Visiting External Accreditation Delegation Pickup',
          dept: 'Faculty of Pharmacy',
          requesterName: 'Dr. Sarah Mansour',
          distanceKm: 42.0,
          estFuelLiters: 9.2,
          estCostEGP: 204.7,
          status: 'Completed',
          statusAr: 'Completed',
          holdAmountEGP: 250.0,
          createdAt: new Date(Date.now() - 48 * 3600 * 1000).toISOString()
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
      try {
        const raw = localStorage.getItem(STORAGE_KEY);
        if (raw) {
          const parsed = JSON.parse(raw);
          if (!parsed.settings) parsed.settings = JSON.parse(JSON.stringify(DEFAULT_SETTINGS));
          if (!parsed.vehicles || parsed.vehicles.length === 0) parsed.vehicles = JSON.parse(JSON.stringify(DEFAULT_VEHICLES));
          if (!parsed.drivers || parsed.drivers.length === 0) parsed.drivers = JSON.parse(JSON.stringify(DEFAULT_DRIVERS));
          return parsed;
        }
      } catch (e) {}

      const init = getInitialData();
      this.save(init);
      return init;
    },

    save: function (data) {
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
      } catch (e) {}
    },

    reset: function () {
      localStorage.removeItem(STORAGE_KEY);
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
      localStorage.removeItem(STORAGE_KEY);
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

    getBookings: function () {
      const data = this.load();
      return data.bookings || [];
    },

    getBooking: function (id) {
      if (!id) return null;
      const bookings = this.getBookings();
      return bookings.find(b => b.id === id) || null;
    },

    getHoldWindow: function (booking) {
      if (!booking) {
        return {
          start: '2026-10-18 08:00',
          end: '2026-10-18 18:45',
          startDateObj: new Date(),
          endDateObj: new Date(),
          bufferMinutes: 45,
          formatted: '18 Oct 08:00 → 18 Oct 18:45',
          formattedWithBuffer: '18 Oct 08:00 → 18 Oct 18:45 (45m turnaround buffer)'
        };
      }

      const settings = this.getSettings();
      const bufferMin = (settings.rules && settings.rules.turnaroundBufferMin) !== undefined
        ? settings.rules.turnaroundBufferMin
        : 45;

      let startStr = '';
      let endStr = '';

      if (Array.isArray(booking.itinerary) && booking.itinerary.length >= 1) {
        const firstPt = booking.itinerary[0];
        const lastPt = booking.itinerary[booking.itinerary.length - 1];
        startStr = firstPt.depart_at || `${booking.startDate || '2026-10-18'} 08:00`;
        endStr = lastPt.arrive_at || lastPt.depart_at || `${booking.endDate || '2026-10-22'} 18:00`;
      } else {
        startStr = `${booking.startDate || booking.start_date || '2026-10-18'} ${booking.departureTime || '08:00'}`;
        endStr = `${booking.endDate || booking.end_date || '2026-10-22'} ${booking.expectedEnd || '18:00'}`;
      }

      const startObj = parseDateTimeSafe(startStr, '08:00');
      const baseEndObj = parseDateTimeSafe(endStr, '18:00');
      const holdEndObj = new Date(baseEndObj.getTime() + bufferMin * 60000);

      const sFmt = formatShortDate(startStr);
      const eFmt = formatShortDate(endStr);
      const sTime = startObj.toTimeString().substring(0, 5);
      const eTime = holdEndObj.toTimeString().substring(0, 5);

      const formatted = `${sFmt} ${sTime} → ${eFmt} ${eTime}`;

      return {
        start: startStr,
        end: endStr,
        startDateObj: startObj,
        endDateObj: holdEndObj,
        bufferMinutes: bufferMin,
        formatted: formatted,
        formattedWithBuffer: `${formatted} (${bufferMin}m turnaround buffer)`
      };
    },

    computeDailyDrivingSummary: function (booking) {
      if (!booking) return [];
      const points = Array.isArray(booking.itinerary) ? booking.itinerary : [];
      const legs = Array.isArray(booking.route_legs) ? booking.route_legs : [];
      const settings = this.getSettings();
      const maxHours = (settings.rules && settings.rules.maxDrivingHoursPerDay) || 8.0;
      const maxMins = maxHours * 60;

      const dailyMap = {};

      legs.forEach((leg, idx) => {
        const fromPt = points[idx] || {};
        const rawDate = (fromPt.depart_at || booking.startDate || '2026-10-18').split(' ')[0];
        dailyMap[rawDate] = (dailyMap[rawDate] || 0) + (leg.drive_minutes || 0);
      });

      if (Object.keys(dailyMap).length === 0) {
        const sDate = booking.startDate || '2026-10-18';
        dailyMap[sDate] = booking.estDriveMinutes || 0;
      }

      const summary = [];
      let dayIdx = 1;
      const sortedDates = Object.keys(dailyMap).sort();

      sortedDates.forEach(dateStr => {
        const totalMins = dailyMap[dateStr];
        const h = Math.floor(totalMins / 60);
        const m = totalMins % 60;
        const exceeds = totalMins > maxMins;
        summary.push({
          dayIndex: dayIdx,
          date: dateStr,
          dateFormatted: formatShortDate(dateStr),
          driveMinutes: totalMins,
          driveHoursFormatted: `${h}h ${m.toString().padStart(2, '0')}m`,
          exceedsLimit: exceeds,
          notice: exceeds
            ? `Day ${dayIdx} (${formatShortDate(dateStr)}) needs ${h}h ${m.toString().padStart(2, '0')}m driving — assign a second driver.`
            : null
        });
        dayIdx++;
      });

      return summary;
    },

    getVehicleEligibility: function (booking) {
      if (!booking) return [];
      const hold = this.getHoldWindow(booking);
      const allVehicles = this.getVehicles();
      const allBookings = this.getBookings();
      const settings = this.getSettings();

      const pax = booking.passengers || 1;
      const cargoKg = booking.has_extra_cargo
        ? (parseFloat(booking.cargo_kg || booking.cargoWeightKg) || 0)
        : 0;

      const depPlace = (Array.isArray(booking.itinerary) && booking.itinerary[0])
        ? (booking.itinerary[0].place_name || '')
        : (booking.origin || '');

      const activeBookings = allBookings.filter(b =>
        b.id !== booking.id && ['Approved', 'Dispatched', 'Active'].includes(b.status)
      );

      const rates = (settings.fuelPrices && settings.fuelPrices.rates) || DEFAULT_SETTINGS.fuelPrices.rates;

      const evaluated = allVehicles.map(v => {
        const reasons = [];

        if (['Maintenance', 'Out of service', 'Decommissioned'].includes(v.status)) {
          reasons.push(`Service lockout (${v.status === 'Maintenance' ? 'Workshop maintenance' : v.status})`);
        }

        if (v.seats < pax) {
          reasons.push(`Only ${v.seats} seats (${pax} required)`);
        }

        if (cargoKg > 0 && v.payloadKg < cargoKg) {
          reasons.push(`Payload ${v.payloadKg.toLocaleString()} kg < ${cargoKg.toLocaleString()} kg`);
        }

        const conflictingBooking = activeBookings.find(other => {
          if (other.vehicleCode !== v.code) return false;
          const otherHold = this.getHoldWindow(other);
          return hold.startDateObj < otherHold.endDateObj && hold.endDateObj > otherHold.startDateObj;
        });

        if (conflictingBooking) {
          const sRange = formatShortRange(conflictingBooking.startDate, conflictingBooking.endDate);
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

        let fuelPrice = rates.diesel || 20.50;
        if (v.fuelType === 'Petrol 92') fuelPrice = rates.petrol92 || 22.25;
        if (v.fuelType === 'Petrol 95') fuelPrice = rates.petrol95 || 24.00;
        if (v.fuelType === 'CNG') fuelPrice = rates.cng || 6.50;

        const loadFactor = (cargoKg > 0 && v.payloadKg > 0)
          ? (1.0 + Math.min(0.5, (cargoKg / v.payloadKg) * 0.25))
          : 1.0;

        const baseDistKm = booking.distanceKm || 100;
        const totalKm = Math.round((baseDistKm + repositioningKm) * 10) / 10;
        const nominal = v.ratePer100Km || 9.5;
        const fuelLiters = Math.round((totalKm * (nominal / 100) * loadFactor) * 10) / 10;
        const costEGP = Math.round(fuelLiters * fuelPrice * 100) / 100;

        return {
          vehicle: v,
          eligible: reasons.length === 0,
          reasons: reasons,
          estimate: {
            distanceKm: baseDistKm,
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
          const vType = selectedVehicle.type || selectedVehicle.category;
          if (d.licenseClass.includes('Class 3')) {
            if (vType !== 'Sedan') {
              reasons.push('Class 3 license (Private): Sedan only');
            }
          } else if (d.licenseClass.includes('Class 2')) {
            if (vType === 'Bus' || vType === 'Truck' || selectedVehicle.category === 'Bus' || selectedVehicle.category === 'Heavy Cargo Truck') {
              reasons.push('Class 2 license: Cannot operate Heavy Coach/Truck');
            }
          }
        }

        const expDate = parseDateTimeSafe(d.expires, '23:59');
        if (expDate <= hold.endDateObj) {
          reasons.push(`License expires ${formatShortDate(d.expires)}`);
        }

        const conflictingBooking = activeBookings.find(other => {
          const matchDriver = (other.driver === d.name) ||
                              (Array.isArray(other.assignedDriverIds) && other.assignedDriverIds.includes(d.id)) ||
                              (other.driverId === d.id);
          if (!matchDriver) return false;
          const otherHold = this.getHoldWindow(other);
          return hold.startDateObj < otherHold.endDateObj && hold.endDateObj > otherHold.startDateObj;
        });

        if (conflictingBooking) {
          const sRange = formatShortRange(conflictingBooking.startDate, conflictingBooking.endDate);
          reasons.push(`Assigned ${sRange} (${conflictingBooking.id})`);
        }

        if (d.status.includes('Expired')) {
          reasons.push('Off Duty: Expired license');
        } else if (d.status.includes('Incident')) {
          reasons.push('Suspended: Incident Triage');
        } else if (d.status.includes('Off Duty')) {
          reasons.push('Off Duty on trip schedule');
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
          const reqMatch = (b.requesterName || '').toLowerCase().includes(q);
          const deptMatch = (b.dept || '').toLowerCase().includes(q);
          const routeMatch = (b.route || '').toLowerCase().includes(q);
          const placeMatch = Array.isArray(b.itinerary) && b.itinerary.some(p => (p.place_name || '').toLowerCase().includes(q));
          return idMatch || reqMatch || deptMatch || routeMatch || placeMatch;
        });
      }

      filtered.sort((a, b) => {
        if (sort === 'submitted') {
          const tA = new Date(a.createdAt || 0).getTime();
          const tB = new Date(b.createdAt || 0).getTime();
          return tB - tA;
        }
        const startA = a.startDate || a.start_date || '2099-12-31';
        const startB = b.startDate || b.start_date || '2099-12-31';
        if (startA !== startB) return startA.localeCompare(startB);
        return (a.departureTime || '00:00').localeCompare(b.departureTime || '00:00');
      });

      const nowMs = Date.now();
      const items = filtered.map(b => {
        const createdMs = b.createdAt ? new Date(b.createdAt).getTime() : nowMs;
        const diffHours = Math.max(0, Math.round((nowMs - createdMs) / 3600000));
        let ageStr = `${diffHours} h ago`;
        if (diffHours < 1) {
          const diffMins = Math.max(1, Math.round((nowMs - createdMs) / 60000));
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

        const days = b.daysCount || RouteEstimator.calculateDaysCount(b.startDate, b.endDate);
        if (days > 1) {
          warningChips.push({
            type: 'info',
            label: `Overnight ×${days - 1}`
          });
        }

        const hasUnpinned = Array.isArray(b.itinerary) && b.itinerary.some(p => p.pinned === false || !p.lat);
        if (hasUnpinned) {
          warningChips.push({
            type: 'warning',
            label: 'Unpinned location'
          });
        }

        const hasCargo = Boolean(b.has_extra_cargo || (b.cargo_kg && b.cargo_kg > 0) || (b.cargoWeightKg && b.cargoWeightKg > 0));
        const cargoWeight = b.cargo_kg || b.cargoWeightKg || 0;

        return {
          booking: b,
          id: b.id,
          requesterName: b.requesterName || 'Institutional Requester',
          dept: b.dept || 'Academic Directorate',
          periodStr: `${formatShortRange(b.startDate, b.endDate)} · ${days} day${days > 1 ? 's' : ''}`,
          routeSummary: b.route || `${b.origin || 'Origin'} → ${b.destination || 'Destination'}`,
          passengers: b.passengers || 4,
          hasCargo: hasCargo,
          cargoWeight: cargoWeight,
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
        const reason = vMatch ? vMatch.reasons.join(', ') : 'Vehicle unavailable';
        return {
          success: false,
          conflict: true,
          error: `${vehicleCode} was just assigned or is unavailable: ${reason}. The list has been refreshed.`
        };
      }

      const dIds = Array.isArray(driverIds) ? driverIds : [driverIds];
      const dEligList = this.getDriverEligibility(b, vehicleCode);

      if (dEligList[0] && dEligList[0].requiresSecondDriver && dIds.length < 2) {
        return {
          success: false,
          error: 'Daily driving duty exceeds 8 hours. Two certified drivers must be assigned.'
        };
      }

      const assignedDrivers = [];
      for (const dId of dIds) {
        const dMatch = dEligList.find(item => item.driver.id === dId || item.driver.name === dId);
        if (!dMatch || !dMatch.eligible) {
          const reason = dMatch ? dMatch.reasons.join(', ') : 'Driver unavailable';
          return {
            success: false,
            conflict: true,
            error: `Driver is no longer available: ${reason}. The list has been refreshed.`
          };
        }
        assignedDrivers.push(dMatch.driver);
      }

      const primaryDriver = assignedDrivers[0];
      const secondDriver = assignedDrivers[1] || null;

      b.status = 'Approved';
      b.statusAr = 'Approved';
      b.vehicleCode = vMatch.vehicle.code;
      b.vehicle = `${vMatch.vehicle.model} (${vMatch.vehicle.code})`;
      b.vehicleCategory = vMatch.vehicle.category;
      b.driver = secondDriver ? `${primaryDriver.name} & ${secondDriver.name}` : primaryDriver.name;
      b.driverId = primaryDriver.id;
      b.assignedDriverIds = assignedDrivers.map(d => d.id);
      if (secondDriver) b.driver2 = secondDriver.name;

      b.hold_window = this.getHoldWindow(b);
      b.estFuelLiters = vMatch.estimate.fuelLiters;
      b.estCostEGP = vMatch.estimate.costEGP;
      b.finalEstimate = {
        fuelLiters: vMatch.estimate.fuelLiters,
        costEGP: vMatch.estimate.costEGP,
        repositioningKm: vMatch.estimate.repositioningKm,
        priceBookVersion: (this.getSettings().fuelPrices && this.getSettings().fuelPrices.activeVersion) || 'v3 (Effective 01 Aug 2026)'
      };

      b.approved_by = 'Khaled Ibrahim (Dispatcher)';
      b.approved_at = new Date().toISOString();
      b.dispatcherNote = note || '';

      b.history = b.history || [];
      b.history.push({
        status: 'Approved',
        at: new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }),
        by: 'Khaled Ibrahim (Dispatcher)',
        time: new Date().toISOString(),
        action: 'Approved & Assigned',
        user: 'Khaled Ibrahim (Dispatcher)',
        note: note || `Assigned ${b.vehicle} with driver ${b.driver}.`
      });

      data.auditTrail = data.auditTrail || [];
      data.auditTrail.unshift({
        id: 'AUD-' + Math.floor(1000 + Math.random() * 9000),
        time: 'Just now',
        user: 'Khaled Ibrahim (Dispatcher)',
        action: 'Approve & Assign Vehicle',
        ref: b.id,
        details: `Assigned ${b.vehicle} + ${b.driver} for window ${b.hold_window.formatted}. Final estimate: ${b.estFuelLiters} L (EGP ${b.estCostEGP}).`
      });

      data.notifications = data.notifications || [];
      data.notifications.unshift({
        id: 'NOTIF-' + Date.now(),
        targetRole: 'Requester',
        targetUser: b.requesterName,
        title: `Booking ${b.id} Approved`,
        message: `Your booking for ${b.route} has been approved. Vehicle: ${b.vehicle}, Driver: ${b.driver}.`,
        time: 'Just now',
        read: false,
        link: `booking-detail.html?id=${b.id}`
      });
      data.notifications.unshift({
        id: 'NOTIF-' + (Date.now() + 1),
        targetRole: 'Driver',
        targetUser: primaryDriver.name,
        title: `New Mission Assignment: ${b.id}`,
        message: `You are assigned to mission ${b.id} (${b.startDate} → ${b.endDate}). Vehicle: ${b.vehicle}.`,
        time: 'Just now',
        read: false,
        link: `driver-trip.html?id=${b.id}`
      });

      this.save(data);
      return { success: true, booking: b };
    },

    rejectBooking: function (id, reasonCode, text) {
      const data = this.load();
      const b = (data.bookings || []).find(item => item.id === id);
      if (!b) return { success: false, error: 'Booking not found' };

      b.status = 'Rejected';
      b.statusAr = 'Rejected';
      b.rejectionReason = reasonCode || 'Other';
      b.rejectionText = text || 'Request rejected by operations dispatch.';
      b.rejected_by = 'Khaled Ibrahim (Dispatcher)';
      b.rejected_at = new Date().toISOString();

      b.history = b.history || [];
      b.history.push({
        time: new Date().toISOString(),
        action: 'Rejected',
        user: 'Khaled Ibrahim (Dispatcher)',
        note: `Reason: ${b.rejectionReason}. Details: ${b.rejectionText}`
      });

      data.auditTrail = data.auditTrail || [];
      data.auditTrail.unshift({
        id: 'AUD-' + Math.floor(1000 + Math.random() * 9000),
        time: 'Just now',
        user: 'Khaled Ibrahim (Dispatcher)',
        action: 'Reject Booking',
        ref: id,
        details: `Rejected with reason: "${b.rejectionReason}". Message: ${b.rejectionText}`
      });

      data.notifications = data.notifications || [];
      data.notifications.unshift({
        id: 'NOTIF-' + Date.now(),
        targetRole: 'Requester',
        targetUser: b.requesterName,
        title: `Booking ${id} Rejected`,
        message: `Reason: ${b.rejectionReason}. Note: ${b.rejectionText}`,
        time: 'Just now',
        read: false,
        link: `booking-detail.html?id=${id}`
      });

      this.save(data);
      return { success: true, booking: b };
    },

    requestChanges: function (id, message) {
      const data = this.load();
      const b = (data.bookings || []).find(item => item.id === id);
      if (!b) return { success: false, error: 'Booking not found' };

      b.status = 'Changes requested';
      b.statusAr = 'Changes requested';
      b.changesRequestedMessage = message || 'Please adjust your mission schedule or itinerary.';
      b.changesRequestedBy = 'Khaled Ibrahim (Dispatcher)';
      b.changesRequestedAt = new Date().toISOString();

      b.history = b.history || [];
      b.history.push({
        time: new Date().toISOString(),
        action: 'Changes Requested',
        user: 'Khaled Ibrahim (Dispatcher)',
        note: b.changesRequestedMessage
      });

      data.auditTrail = data.auditTrail || [];
      data.auditTrail.unshift({
        id: 'AUD-' + Math.floor(1000 + Math.random() * 9000),
        time: 'Just now',
        user: 'Khaled Ibrahim (Dispatcher)',
        action: 'Request Changes',
        ref: id,
        details: `Sent change request: "${b.changesRequestedMessage}"`
      });

      data.notifications = data.notifications || [];
      data.notifications.unshift({
        id: 'NOTIF-' + Date.now(),
        targetRole: 'Requester',
        targetUser: b.requesterName,
        title: `Changes Requested for ${id}`,
        message: `Dispatch requested adjustments: ${b.changesRequestedMessage}`,
        time: 'Just now',
        read: false,
        link: `booking-new.html?edit=${id}`
      });

      this.save(data);
      return { success: true, booking: b };
    },

    dispatchBooking: function (id) {
      const data = this.load();
      const b = (data.bookings || []).find(item => item.id === id);
      if (!b) return { success: false, error: 'Booking not found' };

      b.status = 'Dispatched';
      b.statusAr = 'Dispatched';
      b.dispatched_at = new Date().toISOString();

      b.history = b.history || [];
      b.history.push({
        time: new Date().toISOString(),
        action: 'Dispatched to Fleet',
        user: 'Khaled Ibrahim (Dispatcher)',
        note: `Dispatched vehicle ${b.vehicle} and driver ${b.driver}.`
      });

      data.auditTrail = data.auditTrail || [];
      data.auditTrail.unshift({
        id: 'AUD-' + Math.floor(1000 + Math.random() * 9000),
        time: 'Just now',
        user: 'Khaled Ibrahim (Dispatcher)',
        action: 'Dispatch Mission',
        ref: id,
        details: `Dispatched ${b.id} with vehicle ${b.vehicleCode} and driver ${b.driver}.`
      });

      this.save(data);
      return { success: true, booking: b };
    },

    createBooking: function (payload) {
      const data = this.load();
      if (!data.bookings) data.bookings = [];
      if (!data.auditTrail) data.auditTrail = [];

      const newId = 'BK-' + (2050 + data.bookings.length);
      const points = Array.isArray(payload.itinerary) && payload.itinerary.length >= 2
        ? payload.itinerary
        : [
            {
              sequence: 1,
              type: 'departure',
              place_name: payload.origin || 'Badr University in Assiut',
              depart_at: `${payload.start_date || '2026-10-18'} ${payload.departureTime || '08:00'}`,
              pinned: false
            },
            {
              sequence: 2,
              type: 'return',
              place_name: payload.destination || 'Cairo University',
              arrive_at: `${payload.end_date || '2026-10-22'} ${payload.expectedEnd || '18:00'}`,
              pinned: false
            }
          ];

      const legs = payload.route_legs || RouteEstimator.computeItineraryLegs(points, payload.vehicleCategory || 'Passenger Van');

      let totalKm = 0;
      let totalMins = 0;
      let totalFuel = 0;
      let totalCost = 0;

      legs.forEach(leg => {
        totalKm += (leg.distance_km || 0);
        totalMins += (leg.drive_minutes || 0);
        totalFuel += (leg.fuel_liters || 0);
        totalCost += (leg.cost_egp || 0);
      });

      const firstPoint = points[0];
      const lastPoint = points[points.length - 1];
      const routeStr = payload.route || points.map(p => p.place_name).join(' → ');

      const startDate = payload.start_date || payload.startDate || (firstPoint.depart_at ? firstPoint.depart_at.split(' ')[0] : '2026-10-18');
      const endDate = payload.end_date || payload.endDate || (lastPoint.arrive_at ? lastPoint.arrive_at.split(' ')[0] : '2026-10-22');
      const daysCount = RouteEstimator.calculateDaysCount(startDate, endDate);

      const newBooking = {
        id: newId,
        route: routeStr,
        origin: firstPoint.place_name,
        destination: lastPoint.place_name,
        startDate: startDate,
        endDate: endDate,
        start_date: startDate,
        end_date: endDate,
        date: startDate,
        departureTime: firstPoint.depart_at ? firstPoint.depart_at.split(' ')[1] : '08:00',
        expectedEnd: lastPoint.arrive_at ? lastPoint.arrive_at.split(' ')[1] : '18:00',
        return_with_vehicle: Boolean(payload.return_with_vehicle),
        returnTrip: Boolean(payload.return_with_vehicle),
        itinerary: points,
        route_legs: legs,
        vehicleCategory: payload.vehicleCategory || 'Passenger Van',
        vehicle: 'Pending Allocation',
        vehicleCode: 'TBD',
        driver: 'Pending Assignment',
        passengers: parseInt(payload.passengers || 4, 10),
        has_extra_cargo: Boolean(payload.has_extra_cargo),
        cargo_kg: payload.has_extra_cargo ? (parseFloat(payload.cargo_kg || payload.cargoWeightKg) || 0) : 0,
        cargoWeightKg: payload.has_extra_cargo ? (parseFloat(payload.cargo_kg || payload.cargoWeightKg) || 0) : 0,
        cargo_description: payload.has_extra_cargo ? (payload.cargo_description || '') : '',
        cargo_flags: payload.cargo_flags || { fragile: false, strap: false, loading_help: false },
        purpose: payload.purpose || 'Official Delegation Mission',
        notes: payload.notes || '',
        cost_center: payload.cost_center || 'CC-410 (Faculty of Pharmacy)',
        dept: payload.dept || 'Faculty of Pharmacy',
        requesterName: payload.requesterName || 'Dr. Sarah Mansour',
        driver_overnight_location: payload.driver_overnight_location || '',
        driverAccommodationNights: Math.max(0, daysCount - 1),
        daysCount: daysCount,
        distanceKm: Math.round(totalKm * 10) / 10,
        estDriveMinutes: totalMins,
        estFuelLiters: Math.round(totalFuel * 10) / 10,
        estCostEGP: Math.round(totalCost * 100) / 100,
        holdAmountEGP: Math.round(totalCost * 1.25),
        status: 'Pending',
        statusAr: 'Pending',
        history: [
          {
            status: 'Submitted',
            at: new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }),
            by: `${payload.requesterName || 'Dr. Sarah Mansour'} (Requester)`,
            note: 'Initial booking request submitted'
          }
        ],
        messages: [],
        hold_window: {
          start: firstPoint.depart_at || `${startDate} 08:00`,
          end: lastPoint.arrive_at ? `${lastPoint.arrive_at} (+45m buffer)` : `${endDate} 18:45`,
          bufferMinutes: 45
        },
        createdAt: new Date().toISOString()
      };

      data.bookings.unshift(newBooking);

      data.auditTrail.unshift({
        id: 'AUD-' + Math.floor(1000 + Math.random() * 9000),
        time: 'Just now',
        user: newBooking.requesterName + ' (Requester)',
        action: 'Submit Itinerary Booking',
        ref: newId,
        details: `Created multi-stop itinerary (${points.length} points, ${newBooking.distanceKm} km, ${daysCount} days).`
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
        senderName: msg.senderName || b.requesterName || 'Requester',
        time: msg.time || new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }),
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
      if (itineraryPayload.start_date) {
        b.startDate = itineraryPayload.start_date;
        b.start_date = itineraryPayload.start_date;
      }
      if (itineraryPayload.end_date) {
        b.endDate = itineraryPayload.end_date;
        b.end_date = itineraryPayload.end_date;
      }
      if (itineraryPayload.return_with_vehicle !== undefined) {
        b.return_with_vehicle = Boolean(itineraryPayload.return_with_vehicle);
        b.returnTrip = b.return_with_vehicle;
      }
      if (itineraryPayload.driver_overnight_location !== undefined) {
        b.driver_overnight_location = itineraryPayload.driver_overnight_location;
      }
      if (itineraryPayload.passengers !== undefined) {
        b.passengers = parseInt(itineraryPayload.passengers, 10);
      }
      if (itineraryPayload.has_extra_cargo !== undefined) {
        b.has_extra_cargo = Boolean(itineraryPayload.has_extra_cargo);
      }
      if (itineraryPayload.cargo_kg !== undefined) {
        b.cargo_kg = b.has_extra_cargo ? (parseFloat(itineraryPayload.cargo_kg) || 0) : 0;
        b.cargoWeightKg = b.cargo_kg;
      }
      if (itineraryPayload.cargo_description !== undefined) {
        b.cargo_description = b.has_extra_cargo ? itineraryPayload.cargo_description : '';
      }
      if (itineraryPayload.cargo_flags !== undefined) {
        b.cargo_flags = itineraryPayload.cargo_flags;
      }
      if (itineraryPayload.vehicleCategory) {
        b.vehicleCategory = itineraryPayload.vehicleCategory;
      }

      if (b.itinerary && b.itinerary.length >= 2) {
        b.route_legs = RouteEstimator.computeItineraryLegs(b.itinerary, b.vehicleCategory || 'Passenger Van');
        let km = 0, mins = 0, fuel = 0, cost = 0;
        b.route_legs.forEach(l => {
          km += l.distance_km;
          mins += l.drive_minutes;
          fuel += l.fuel_liters;
          cost += l.cost_egp;
        });
        b.distanceKm = Math.round(km * 10) / 10;
        b.estDriveMinutes = mins;
        b.estFuelLiters = Math.round(fuel * 10) / 10;
        b.estCostEGP = Math.round(cost * 100) / 100;
        b.route = b.itinerary.map(p => p.place_name).join(' → ');
      }

      if (wasApproved || wasChangesRequested) {
        b.status = 'Pending';
        b.statusAr = 'Pending';
        b.vehicle = 'Pending Allocation';
        b.vehicleCode = 'TBD';
        b.driver = 'Pending Assignment';
        b.changesRequestedMessage = null;
      }

      data.auditTrail = data.auditTrail || [];
      data.auditTrail.unshift({
        id: 'AUD-' + Math.floor(1000 + Math.random() * 9000),
        time: 'Just now',
        user: b.requesterName + ' (Requester)',
        action: wasApproved ? 'Modify Itinerary (Reset to Pending)' : (wasChangesRequested ? 'Resubmit Modified Itinerary' : 'Update Itinerary'),
        ref: id,
        details: `Updated itinerary points. Reset to Pending for Operations review.`
      });

      this.save(data);
      return b;
    },

    startTrip: function (id) {
      const data = this.load();
      const b = data.bookings.find(item => item.id === id);
      if (!b) return null;

      b.status = 'Active';
      b.statusAr = 'Active';

      data.auditTrail = data.auditTrail || [];
      data.auditTrail.unshift({
        id: 'AUD-' + Math.floor(1000 + Math.random() * 9000),
        time: 'Just now',
        user: b.driver || 'Driver',
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

      b.actualOdoEnd = parseInt(payload.endOdo || ((b.actualOdoStart || 50000) + b.distanceKm), 10);
      b.actualFuelLitres = parseFloat(payload.fuelLitres || 14.5);
      b.actualFuelCostEGP = parseFloat(payload.fuelCost || 297.25);

      const standardLiters = b.estFuelLiters || 14.1;
      const variancePct = ((b.actualFuelLitres - standardLiters) / standardLiters) * 100.0;
      b.fuelVariancePct = parseFloat(variancePct.toFixed(1));

      b.status = 'Closed';
      b.statusAr = 'Closed';

      data.auditTrail = data.auditTrail || [];
      data.auditTrail.unshift({
        id: 'AUD-' + Math.floor(1000 + Math.random() * 9000),
        time: 'Just now',
        user: b.driver || 'Driver',
        action: 'Close Trip & Fuel Receipt',
        ref: id,
        details: `End Odo: ${b.actualOdoEnd}. Fuel: ${b.actualFuelLitres}L (EGP ${b.actualFuelCostEGP}). Variance: ${b.fuelVariancePct}%`
      });

      this.save(data);
      return b;
    },

    reconcileTrip: function (id, auditorNotes) {
      const data = this.load();
      const b = data.bookings.find(item => item.id === id);
      if (!b) return null;

      b.status = 'Completed';
      b.statusAr = 'Completed';
      b.auditorClearedAt = new Date().toISOString();

      data.auditTrail = data.auditTrail || [];
      data.auditTrail.unshift({
        id: 'AUD-' + Math.floor(1000 + Math.random() * 9000),
        time: 'Just now',
        user: 'Mona Adel (Auditor)',
        action: 'Audit Reconcile & Settle',
        ref: id,
        details: auditorNotes || `Cleared fuel variance (${b.fuelVariancePct}%). Final department chargeback approved.`
      });

      this.save(data);
      return b;
    }
  };

  window.FleetStore = FleetStore;
})();
