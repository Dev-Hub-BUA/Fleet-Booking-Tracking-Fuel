(function () {
  'use strict';

  const STORAGE_KEY = 'cira_fleet_live_store_v2';

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
    if (window.CIRA_DATA) {
      return JSON.parse(JSON.stringify(window.CIRA_DATA));
    }
    return {
      vehicles: [],
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
          vehicle: 'Hyundai H-1 (V-122)',
          vehicleCode: 'V-122',
          driver: 'Ahmed Hassan (Driver A)',
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
          estCostEGP: 1828.95,
          holdAmountEGP: 2200.0,
          status: 'Active',
          statusAr: 'Active',
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
          ],
          actualOdoStart: 84210,
          actualOdoEnd: null,
          actualFuelLitres: null,
          actualFuelCostEGP: null,
          fuelVariancePct: null,
          createdAt: new Date().toISOString()
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
          cargo_description: '',
          cargo_flags: {
            fragile: false,
            strap: false,
            loading_help: false
          },
          purpose: 'Visiting External Accreditation Delegation Pickup',
          dept: 'Faculty of Pharmacy',
          requesterName: 'Dr. Sarah Mansour',
          distanceKm: 42.0,
          estFuelLiters: 9.2,
          estCostEGP: 204.7,
          status: 'Completed',
          statusAr: 'Completed',
          holdAmountEGP: 250.0,
          itinerary: [
            {
              sequence: 1,
              type: 'departure',
              place_name: 'BUC Admin Building',
              lat: 30.1378,
              lng: 31.7456,
              pinned: true,
              depart_at: '2026-10-12 14:00'
            },
            {
              sequence: 2,
              type: 'return',
              place_name: 'Cairo Airport Terminal 3',
              lat: 30.1114,
              lng: 31.4065,
              pinned: true,
              arrive_at: '2026-10-12 17:30'
            }
          ],
          route_legs: [
            {
              from_seq: 1,
              to_seq: 2,
              from_place: 'BUC Admin Building',
              to_place: 'Cairo Airport Terminal 3',
              distance_km: 42.0,
              drive_minutes: 45,
              fuel_liters: 9.2,
              cost_egp: 204.7
            }
          ],
          actualOdoStart: 51200,
          actualOdoEnd: 51242,
          actualFuelLitres: 9.4,
          actualFuelCostEGP: 209.15,
          fuelVariancePct: 2.2,
          createdAt: new Date(Date.now() - 86400000).toISOString()
        }
      ],
      dispatchQueue: [
        {
          id: 'BK-2047',
          route: 'Assiut → Cairo → BUC → Assiut (5 days)',
          flag: 'Multi-Day Itinerary (5d)',
          kind: 'info',
          meta: '18 Oct 08:00 → 22 Oct 18:00 · Faculty of Pharmacy'
        },
        {
          id: 'BK-2049',
          route: 'Main Campus → Cairo International Airport T3',
          flag: 'Re-Approval',
          kind: 'warn',
          meta: '13 Oct 05:00–07:30 · President’s Office'
        },
        {
          id: 'BK-2051',
          route: 'BUC Badr → Ain Sokhna Marine Station',
          flag: 'Long Haul (>200km)',
          kind: 'warn',
          meta: '14 Oct 07:00–18:00 · Student Affairs'
        }
      ],
      auditTrail: [
        {
          id: 'AUD-8801',
          time: 'Today · 08:35',
          user: 'Khaled Ibrahim (Dispatcher)',
          action: 'Approve Multi-Day Itinerary',
          ref: 'BK-2047',
          details: 'Assigned Hyundai H-1 (V-122) with Driver Ahmed Hassan. Verified 5-day hold window (18–22 Oct) and rest buffers.'
        },
        {
          id: 'AUD-8798',
          time: 'Yesterday · 17:45',
          user: 'Mona Adel (Auditor)',
          action: 'Fuel Settle & Reconcile',
          ref: 'BK-2045',
          details: 'Verified fuel receipt EGP 209.15 (+2.2% variance within ±10% threshold). Cleared.'
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
          const b2047 = (parsed.bookings || []).find(b => b.id === 'BK-2047');
          if (b2047 && b2047.has_extra_cargo === undefined) {
            b2047.has_extra_cargo = true;
            b2047.cargo_kg = 350;
            b2047.cargoWeightKg = 350;
            b2047.cargo_description = '6 boxes of lab equipment, 2 projectors, fragile';
            b2047.cargo_flags = { fragile: true, strap: true, loading_help: false };
            this.save(parsed);
          }
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
      const empty = { vehicles: [], bookings: [], dispatchQueue: [], auditTrail: [] };
      this.save(empty);
      return empty;
    },

    resetDemo: function () {
      localStorage.removeItem(STORAGE_KEY);
      const init = getInitialData();
      this.save(init);
      return init;
    },

    getBookings: function () {
      const data = this.load();
      return data.bookings || [];
    },

    getBooking: function (id) {
      const bookings = this.getBookings();
      return bookings.find(b => b.id === id) || bookings[0] || null;
    },

    createBooking: function (payload) {
      const data = this.load();
      if (!data.bookings) data.bookings = [];
      if (!data.dispatchQueue) data.dispatchQueue = [];
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
        vehicleCategory: payload.vehicleCategory || 'Pending Operations Assignment',
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
        hold_window: {
          start: firstPoint.depart_at || `${startDate} 08:00`,
          end: lastPoint.arrive_at ? `${lastPoint.arrive_at} (+45m buffer)` : `${endDate} 18:45`,
          bufferMinutes: 45
        },
        actualOdoStart: null,
        actualOdoEnd: null,
        actualFuelLitres: null,
        actualFuelCostEGP: null,
        fuelVariancePct: null,
        createdAt: new Date().toISOString()
      };

      data.bookings.unshift(newBooking);

      data.dispatchQueue.unshift({
        id: newId,
        route: newBooking.route,
        flag: daysCount > 1 ? `Multi-Day (${daysCount}d)` : 'New Submission',
        kind: 'info',
        meta: `${startDate} → ${endDate} · ${newBooking.dept}`
      });

      data.auditTrail.unshift({
        id: 'AUD-' + Math.floor(1000 + Math.random() * 9000),
        time: 'Just now',
        user: newBooking.requesterName + ' (Requester)',
        action: 'Submit Itinerary Booking',
        ref: newId,
        details: `Created multi-stop itinerary (${points.length} points, ${newBooking.distanceKm} km, ${daysCount} days). Est cost: EGP ${newBooking.estCostEGP}`
      });

      this.save(data);
      return newBooking;
    },

    updateBookingItinerary: function (id, itineraryPayload) {
      const data = this.load();
      const b = data.bookings.find(item => item.id === id);
      if (!b) return null;

      const wasApproved = (b.status === 'Dispatched' || b.status === 'Active');

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

      if (wasApproved) {
        b.status = 'Pending';
        b.statusAr = 'Pending';
        b.vehicle = 'Pending Allocation';
        b.vehicleCode = 'TBD';
        b.driver = 'Pending Assignment';

        if (!data.dispatchQueue.some(q => q.id === id)) {
          data.dispatchQueue.unshift({
            id: id,
            route: b.route,
            flag: 'Itinerary Modified',
            kind: 'warn',
            meta: `${b.startDate} → ${b.endDate} · Re-review required`
          });
        }
      }

      data.auditTrail.unshift({
        id: 'AUD-' + Math.floor(1000 + Math.random() * 9000),
        time: 'Just now',
        user: b.requesterName + ' (Requester)',
        action: wasApproved ? 'Modify Itinerary (Reset to Pending)' : 'Update Itinerary',
        ref: id,
        details: `Updated itinerary points. ${wasApproved ? 'Approved status revoked for re-dispatch.' : ''}`
      });

      this.save(data);
      return b;
    },

    approveBooking: function (id, vehicleCode, driverName, vehicleModel, category, fuelLiters, costEGP) {
      const data = this.load();
      const b = data.bookings.find(item => item.id === id);
      if (!b) return null;

      b.status = 'Dispatched';
      b.statusAr = 'Dispatched';
      b.vehicleCode = vehicleCode || 'V-122';
      b.vehicle = vehicleModel || (vehicleCode === 'V-130' ? 'Toyota HiAce (V-130)' : 'Hyundai H-1 (V-122)');
      b.driver = driverName || 'Ahmed Hassan (Driver A)';
      if (category) b.vehicleCategory = category;
      if (fuelLiters !== undefined && fuelLiters !== null) b.estFuelLiters = fuelLiters;
      if (costEGP !== undefined && costEGP !== null) b.estCostEGP = costEGP;
      b.actualOdoStart = 84210;

      data.dispatchQueue = data.dispatchQueue.filter(q => q.id !== id);

      data.auditTrail.unshift({
        id: 'AUD-' + Math.floor(1000 + Math.random() * 9000),
        time: 'Just now',
        user: 'Khaled Ibrahim (Dispatcher)',
        action: 'Approve & Assign Vehicle',
        ref: id,
        details: `Assigned vehicle ${b.vehicleCode} and driver ${b.driver} for period ${b.startDate} → ${b.endDate}.`
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

      data.auditTrail.unshift({
        id: 'AUD-' + Math.floor(1000 + Math.random() * 9000),
        time: 'Just now',
        user: b.driver || 'Ahmed Hassan (Driver)',
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

      b.actualOdoEnd = parseInt(payload.endOdo || (b.actualOdoStart + b.distanceKm), 10);
      b.actualFuelLitres = parseFloat(payload.fuelLitres || 14.5);
      b.actualFuelCostEGP = parseFloat(payload.fuelCost || 297.25);

      const standardLiters = b.estFuelLiters || 14.1;
      const variancePct = ((b.actualFuelLitres - standardLiters) / standardLiters) * 100.0;
      b.fuelVariancePct = parseFloat(variancePct.toFixed(1));

      b.status = 'Closed';
      b.statusAr = 'Closed';

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
