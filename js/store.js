(function () {
  'use strict';

  const STORAGE_KEY = 'cira_fleet_live_store_v1';

  function getInitialData() {
    if (window.CIRA_DATA) {
      return JSON.parse(JSON.stringify(window.CIRA_DATA));
    }
    return {
      vehicles: [],
      bookings: [
        {
          id: 'BK-2047',
          route: 'Campus → Obour → 10th of Ramadan Plant 3',
          origin: 'Badr University — Main campus, Gate 2',
          destination: 'Plant 3 — 10th of Ramadan Industrial Zone',
          date: '2026-10-13',
          departureTime: '08:30',
          expectedEnd: '14:00',
          vehicle: 'Hyundai H-1 (V-122)',
          vehicleCode: 'V-122',
          driver: 'Ahmed Hassan (Driver A)',
          passengers: 4,
          cargoWeightKg: 350,
          purpose: 'Industrial Lab Equipment Collection & Student Site Visit',
          requesterName: 'Dr. Sarah Mansour',
          dept: 'Faculty of Pharmacy',
          distanceKm: 61.4,
          estFuelLiters: 14.1,
          estCostEGP: 289.05,
          status: 'Active',
          statusAr: 'Active',
          holdAmountEGP: 350.0,
          actualOdoStart: 84210,
          actualOdoEnd: null,
          actualFuelLitres: null,
          actualFuelCostEGP: null,
          fuelVariancePct: null,
          createdAt: new Date().toISOString()
        },
        {
          id: 'BK-2045',
          route: 'Campus → Cairo International Airport T3',
          origin: 'BUC Admin Building',
          destination: 'Cairo Airport Terminal 3',
          date: '2026-10-12',
          departureTime: '14:00',
          expectedEnd: '17:30',
          vehicle: 'Toyota Corolla (V-205)',
          vehicleCode: 'V-205',
          driver: 'Mahmoud Fawzy',
          passengers: 2,
          cargoWeightKg: 40,
          purpose: 'Visiting External Accreditation Delegation Pickup',
          requesterName: 'Dr. Sarah Mansour',
          dept: 'Faculty of Pharmacy',
          distanceKm: 42.0,
          estFuelLiters: 9.2,
          estCostEGP: 204.7,
          status: 'Completed',
          statusAr: 'Completed',
          holdAmountEGP: 250.0,
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
          route: 'Campus → Obour → Plant 3',
          flag: 'Tight Buffer (25m)',
          kind: 'danger',
          meta: 'Departs 08:30 · Faculty of Pharmacy'
        },
        {
          id: 'BK-2051',
          route: 'BUC Badr → Ain Sokhna Marine Station',
          flag: 'Long Haul (>200km)',
          kind: 'warn',
          meta: 'Tomorrow 07:00 · Faculty of Engineering'
        }
      ],
      auditTrail: [
        {
          id: 'AUD-8801',
          time: 'Today · 08:35',
          user: 'Khaled Ibrahim (Dispatcher)',
          action: 'Approve & Lock Vehicle',
          ref: 'BK-2047',
          details: 'Assigned Hyundai H-1 (V-122) with Driver Ahmed Hassan. Pre-trip buffer confirmed.'
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
    load: function () {
      try {
        const raw = localStorage.getItem(STORAGE_KEY);
        if (raw) return JSON.parse(raw);
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

      const newBooking = {
        id: newId,
        route: `${payload.origin || 'Main Campus'} → ${payload.destination || 'Destination'}`,
        origin: payload.origin || 'Badr University — Main campus, Gate 2',
        destination: payload.destination || 'Plant 3 — 10th of Ramadan Industrial Zone',
        date: payload.date || new Date().toISOString().split('T')[0],
        departureTime: payload.departureTime || '09:00',
        expectedEnd: payload.expectedEnd || '14:30',
        vehicle: payload.vehicle || 'Pending Allocation',
        vehicleCode: payload.vehicleCode || 'TBD',
        driver: payload.driver || 'Pending Assignment',
        passengers: parseInt(payload.passengers || 4, 10),
        cargoWeightKg: parseInt(payload.cargoWeightKg || 250, 10),
        purpose: payload.purpose || 'Official University Delegation Mission',
        requesterName: payload.requesterName || 'Dr. Sarah Mansour',
        dept: payload.dept || 'Faculty of Pharmacy',
        distanceKm: parseFloat(payload.distanceKm || 61.4),
        estFuelLiters: parseFloat(payload.estFuelLiters || 14.1),
        estCostEGP: parseFloat(payload.estCostEGP || 289.05),
        status: 'Pending',
        statusAr: 'Pending',
        holdAmountEGP: parseFloat(payload.holdAmountEGP || 350.0),
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
        flag: 'New Submission',
        kind: 'info',
        meta: `Departs ${newBooking.departureTime} · ${newBooking.dept}`
      });

      data.auditTrail.unshift({
        id: 'AUD-' + Math.floor(1000 + Math.random() * 9000),
        time: 'Just now',
        user: newBooking.requesterName + ' (Requester)',
        action: 'Submit Booking',
        ref: newId,
        details: `Created reservation for ${newBooking.route}. Est cost: EGP ${newBooking.estCostEGP}`
      });

      this.save(data);
      return newBooking;
    },

    approveBooking: function (id, vehicleCode, driverName, vehicleModel) {
      const data = this.load();
      const b = data.bookings.find(item => item.id === id);
      if (!b) return null;

      b.status = 'Dispatched';
      b.statusAr = 'Dispatched';
      b.vehicleCode = vehicleCode || 'V-122';
      b.vehicle = vehicleModel || (vehicleCode === 'V-130' ? 'Toyota HiAce (V-130)' : 'Hyundai H-1 (V-122)');
      b.driver = driverName || 'Ahmed Hassan (Driver A)';
      b.actualOdoStart = 84210;

      data.dispatchQueue = data.dispatchQueue.filter(q => q.id !== id);

      data.auditTrail.unshift({
        id: 'AUD-' + Math.floor(1000 + Math.random() * 9000),
        time: 'Just now',
        user: 'Khaled Ibrahim (Dispatcher)',
        action: 'Approve & Assign',
        ref: id,
        details: `Assigned vehicle ${b.vehicleCode} and driver ${b.driver}. Buffers confirmed.`
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
