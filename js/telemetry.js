const Telemetry = (function () {
  'use strict';

  const TICK_INTERVAL_MS = 4000;
  const MAX_HISTORY_PER_VEHICLE = 100;
  const STALE_THRESHOLD_MS = 5 * 60 * 1000;

  const subscribers = new Set();
  const simulatedTrackers = new Map();
  let tickTimerId = null;

  function toIsoNow() {
    const d = new Date();
    const pad = n => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}+03:00`;
  }

  function calculateBearing(lat1, lng1, lat2, lng2) {
    const y = Math.sin((lng2 - lng1) * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180);
    const x = Math.cos(lat1 * Math.PI / 180) * Math.sin(lat2 * Math.PI / 180) -
              Math.sin(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.cos((lng2 - lng1) * Math.PI / 180);
    const brng = Math.atan2(y, x) * 180 / Math.PI;
    return (brng + 360) % 360;
  }

  function calculateDistanceKm(lat1, lng1, lat2, lng2) {
    const R = 6371;
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLng = (lng2 - lng1) * Math.PI / 180;
    const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
              Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
              Math.sin(dLng / 2) * Math.sin(dLng / 2);
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  }

  function getStoredPings() {
    if (typeof localStorage === 'undefined') return {};
    try {
      const raw = localStorage.getItem('cira_telemetry_pings');
      return raw ? JSON.parse(raw) : {};
    } catch (e) {
      return {};
    }
  }

  function saveStoredPings(allPings) {
    if (typeof localStorage === 'undefined') return;
    try {
      localStorage.setItem('cira_telemetry_pings', JSON.stringify(allPings));
    } catch (e) {}
  }

  function savePingToStore(ping) {
    const all = getStoredPings();
    if (!all[ping.vehicle_id]) {
      all[ping.vehicle_id] = [];
    }
    all[ping.vehicle_id].unshift(ping);
    if (all[ping.vehicle_id].length > MAX_HISTORY_PER_VEHICLE) {
      all[ping.vehicle_id] = all[ping.vehicle_id].slice(0, MAX_HISTORY_PER_VEHICLE);
    }
    saveStoredPings(all);
  }

  async function buildRouteGeometryForBooking(booking) {
    if (!booking.itinerary || booking.itinerary.length < 2) return null;

    const coordsList = [];
    for (let i = 0; i < booking.itinerary.length - 1; i++) {
      const p1 = booking.itinerary[i];
      const p2 = booking.itinerary[i + 1];
      const lat1 = Number(p1.lat);
      const lng1 = Number(p1.lng);
      const lat2 = Number(p2.lat);
      const lng2 = Number(p2.lng);

      if (!isNaN(lat1) && !isNaN(lng1) && !isNaN(lat2) && !isNaN(lng2)) {
        if (window.GeoService && typeof window.GeoService.getRouteBetweenPoints === 'function') {
          const route = await window.GeoService.getRouteBetweenPoints({ lat: lat1, lng: lng1 }, { lat: lat2, lng: lng2 });
          if (route && route.coordinates && route.coordinates.length > 0) {
            coordsList.push(...route.coordinates);
            continue;
          }
        }
        coordsList.push([lat1, lng1], [lat2, lng2]);
      }
    }
    return coordsList.length > 0 ? coordsList : null;
  }

  async function getOrInitTracker(booking) {
    const vId = booking.assignment && booking.assignment.vehicle_id;
    if (!vId) return null;

    let tracker = simulatedTrackers.get(vId);
    if (!tracker || tracker.booking_id !== booking.id) {
      const geometry = await buildRouteGeometryForBooking(booking);
      if (!geometry || geometry.length === 0) return null;

      tracker = {
        booking_id: booking.id,
        vehicle_id: vId,
        geometry: geometry,
        currentIndex: 0,
        speedKmh: 68,
        heading: 0,
        lastTickTime: Date.now()
      };
      simulatedTrackers.set(vId, tracker);
    }
    return tracker;
  }

  async function tickSimulation() {
    if (!window.FleetStore) return;
    const bookings = window.FleetStore.getBookings() || [];
    const activeBookings = bookings.filter(b => b.status === 'Active' || b.status === 'Dispatched');

    for (const b of activeBookings) {
      const tracker = await getOrInitTracker(b);
      if (!tracker || !tracker.geometry || tracker.geometry.length === 0) continue;

      const geom = tracker.geometry;
      let nextIndex = tracker.currentIndex + 1;
      if (nextIndex >= geom.length) {
        nextIndex = 0;
      }

      const currPt = geom[tracker.currentIndex];
      const nextPt = geom[nextIndex];

      const lat1 = currPt[0];
      const lng1 = currPt[1];
      const lat2 = nextPt[0];
      const lng2 = nextPt[1];

      const heading = calculateBearing(lat1, lng1, lat2, lng2);
      const speedFluctuation = Math.floor(Math.random() * 12) - 6;
      const speed = Math.max(54, Math.min(84, tracker.speedKmh + speedFluctuation));

      tracker.currentIndex = nextIndex;
      tracker.speedKmh = speed;
      tracker.heading = heading;
      tracker.lastTickTime = Date.now();

      const ping = {
        booking_id: b.id,
        vehicle_id: tracker.vehicle_id,
        lat: Number(lat2.toFixed(6)),
        lng: Number(lng2.toFixed(6)),
        speed_kmh: speed,
        heading: Math.round(heading),
        at: toIsoNow(),
        status: 'Moving'
      };

      savePingToStore(ping);
    }

    notifySubscribers();
  }

  function notifySubscribers() {
    const allLive = getAllLiveVehicles();
    subscribers.forEach(cb => {
      try { cb(allLive); } catch (e) {}
    });
  }

  function latest(vehicleId) {
    if (!vehicleId) return null;
    const all = getStoredPings();
    const list = all[vehicleId];
    if (!list || list.length === 0) return null;

    const ping = Object.assign({}, list[0]);
    const ageMs = Date.now() - new Date(ping.at).getTime();
    ping.is_stale = ageMs > STALE_THRESHOLD_MS;
    if (ping.is_stale) {
      ping.status = 'SignalLost';
    }
    return ping;
  }

  function latestForBooking(bookingId) {
    if (!bookingId || !window.FleetStore) return null;
    const b = window.FleetStore.getBooking(bookingId);
    if (!b || !b.assignment || !b.assignment.vehicle_id) return null;
    const ping = latest(b.assignment.vehicle_id);
    if (ping && ping.booking_id === bookingId) return ping;
    return null;
  }

  function getAllLiveVehicles() {
    if (!window.FleetStore) return [];
    const vehicles = window.FleetStore.getVehicles() || [];
    const bookings = window.FleetStore.getBookings() || [];
    const drivers = window.FleetStore.getDrivers() || [];
    const sites = window.FleetStore.getSites() || [];

    return vehicles.map(v => {
      const activeBooking = bookings.find(b =>
        (b.status === 'Active' || b.status === 'Dispatched') &&
        b.assignment && b.assignment.vehicle_id === v.code
      );

      const recentPing = latest(v.code) || latest(v.id);

      if (activeBooking && recentPing) {
        let driverName = 'Assigned Driver';
        if (activeBooking.assignment && activeBooking.assignment.driver_ids && activeBooking.assignment.driver_ids.length > 0) {
          const dId = activeBooking.assignment.driver_ids[0];
          const dObj = drivers.find(d => d.id === dId);
          driverName = dObj ? dObj.name : dId;
        }

        return {
          id: v.code,
          code: v.code,
          make: v.make,
          model: v.model,
          type: v.type,
          lat: recentPing.lat,
          lng: recentPing.lng,
          speed_kmh: recentPing.speed_kmh,
          heading: recentPing.heading,
          at: recentPing.at,
          status: recentPing.status,
          is_stale: recentPing.is_stale,
          booking_id: activeBooking.id,
          driver_name: driverName,
          label: `${v.code} (${v.make} ${v.model})`
        };
      }

      const site = sites.find(s => s.id === v.home_site_id) || sites[0] || { lat: 27.1809, lng: 31.1837, name: 'Assiut Campus' };
      const isIncident = v.status && v.status.toLowerCase().includes('incident');

      return {
        id: v.code,
        code: v.code,
        make: v.make,
        model: v.model,
        type: v.type,
        lat: Number(site.lat || 27.1809),
        lng: Number(site.lng || 31.1837),
        speed_kmh: 0,
        heading: 0,
        at: toIsoNow(),
        status: isIncident ? 'Incident' : 'Idle',
        is_stale: false,
        booking_id: null,
        driver_name: 'Standby Depot',
        label: `${v.code} (${v.make} ${v.model})`
      };
    });
  }

  function subscribe(callback) {
    if (typeof callback !== 'function') return () => {};
    subscribers.add(callback);
    return () => {
      subscribers.delete(callback);
    };
  }

  function start() {
    if (tickTimerId) return;
    tickSimulation();
    tickTimerId = setInterval(tickSimulation, TICK_INTERVAL_MS);
  }

  function stop() {
    if (tickTimerId) {
      clearInterval(tickTimerId);
      tickTimerId = null;
    }
  }

  if (typeof document !== 'undefined') {
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', start);
    } else {
      start();
    }
  }

  return {
    latest,
    latestForBooking,
    getAllLiveVehicles,
    subscribe,
    start,
    stop,
    calculateBearing,
    calculateDistanceKm
  };
})();

if (typeof window !== 'undefined') {
  window.Telemetry = Telemetry;
}
