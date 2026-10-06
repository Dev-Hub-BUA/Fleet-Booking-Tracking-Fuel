const GeoService = (function () {
  'use strict';

  const TILE_URL = 'https://tile.openstreetmap.org/{z}/{x}/{y}.png';
  const ATTRIBUTION = '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a> contributors';
  const NOMINATIM_BASE = 'https://nominatim.openstreetmap.org/search';
  const OSRM_BASE = 'https://router.project-osrm.org/route/v1/driving';

  const nominatimCache = new Map();
  const routeCache = new Map();
  const inFlightRoutes = new Map();

  let lastNominatimTimestamp = 0;

  function formatCoordKey(lat, lng) {
    return `${Number(lat).toFixed(4)},${Number(lng).toFixed(4)}`;
  }

  function formatRouteKey(p1, p2) {
    return `${formatCoordKey(p1.lat, p1.lng)}->${formatCoordKey(p2.lat, p2.lng)}`;
  }

  async function searchNominatim(query) {
    const q = (query || '').trim();
    if (!q) return [];

    const cacheKey = q.toLowerCase();
    if (nominatimCache.has(cacheKey)) {
      return nominatimCache.get(cacheKey);
    }

    const now = Date.now();
    const elapsed = now - lastNominatimTimestamp;
    if (elapsed < 1000) {
      await new Promise(resolve => setTimeout(resolve, 1000 - elapsed));
    }
    lastNominatimTimestamp = Date.now();

    const url = `${NOMINATIM_BASE}?format=json&countrycodes=eg&limit=8&q=${encodeURIComponent(q)}`;
    try {
      const resp = await fetch(url, {
        headers: {
          'Accept': 'application/json'
        }
      });
      if (!resp.ok) throw new Error(`Nominatim HTTP ${resp.status}`);
      const data = await resp.json();
      const results = (data || []).map(item => ({
        name: item.name || (item.display_name ? item.display_name.split(',')[0].trim() : 'Location'),
        fullAddress: item.display_name || '',
        lat: parseFloat(item.lat),
        lng: parseFloat(item.lon)
      }));
      nominatimCache.set(cacheKey, results);
      return results;
    } catch (err) {
      if (window.FleetStore && window.FleetStore.RouteEstimator) {
        const found = window.FleetStore.RouteEstimator.locations.filter(l =>
          l.name.toLowerCase().includes(cacheKey) || (l.city && l.city.toLowerCase().includes(cacheKey))
        );
        return found.map(f => ({
          name: f.name,
          fullAddress: `${f.name}, ${f.city || 'Egypt'}`,
          lat: f.lat,
          lng: f.lng
        }));
      }
      return [];
    }
  }

  async function getRouteBetweenPoints(p1, p2) {
    if (!p1 || !p2 || typeof p1.lat !== 'number' || typeof p1.lng !== 'number' || typeof p2.lat !== 'number' || typeof p2.lng !== 'number') {
      return null;
    }

    const key = formatRouteKey(p1, p2);
    if (routeCache.has(key)) {
      return routeCache.get(key);
    }

    if (inFlightRoutes.has(key)) {
      return inFlightRoutes.get(key);
    }

    const fetchPromise = (async () => {
      const coords = `${p1.lng},${p1.lat};${p2.lng},${p2.lat}`;
      const url = `${OSRM_BASE}/${coords}?overview=full&geometries=geojson`;

      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 6000);
        const resp = await fetch(url, { signal: controller.signal });
        clearTimeout(timeoutId);

        if (!resp.ok) throw new Error(`OSRM HTTP ${resp.status}`);
        const data = await resp.json();

        if (data.code === 'Ok' && data.routes && data.routes.length > 0) {
          const route = data.routes[0];
          const distKm = Math.round((route.distance / 1000) * 10) / 10;
          const mins = Math.round(route.duration / 60);
          const latLngs = (route.geometry.coordinates || []).map(([lng, lat]) => [lat, lng]);

          const result = {
            distance_km: distKm,
            drive_minutes: mins,
            coordinates: latLngs,
            isRealRoute: true
          };
          routeCache.set(key, result);
          return result;
        } else {
          throw new Error(data.message || 'No route found');
        }
      } catch (err) {
        let dist = 100;
        let mins = 80;
        if (window.FleetStore && window.FleetStore.RouteEstimator) {
          const est = window.FleetStore.RouteEstimator.estimateLeg(p1, p2, 'Passenger Van', 1.0);
          dist = est.distance_km;
          mins = est.drive_minutes;
        } else {
          const dLat = (p2.lat - p1.lat) * Math.PI / 180;
          const dLng = (p2.lng - p1.lng) * Math.PI / 180;
          const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
                    Math.cos(p1.lat * Math.PI / 180) * Math.cos(p2.lat * Math.PI / 180) *
                    Math.sin(dLng / 2) * Math.sin(dLng / 2);
          const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
          dist = Math.round(6371 * c * 1.28 * 10) / 10;
          mins = Math.round((dist / 70) * 60);
        }

        const fallback = {
          distance_km: dist,
          drive_minutes: mins,
          coordinates: [[p1.lat, p1.lng], [p2.lat, p2.lng]],
          isRealRoute: false
        };
        routeCache.set(key, fallback);
        return fallback;
      } finally {
        inFlightRoutes.delete(key);
      }
    })();

    inFlightRoutes.set(key, fetchPromise);
    return fetchPromise;
  }

  function createTileLayer() {
    if (typeof L === 'undefined') return null;
    return L.tileLayer(TILE_URL, {
      maxZoom: 19,
      attribution: ATTRIBUTION
    });
  }

  return {
    TILE_URL,
    ATTRIBUTION,
    searchNominatim,
    getRouteBetweenPoints,
    createTileLayer,
    formatCoordKey
  };
})();

if (typeof window !== 'undefined') {
  window.GeoService = GeoService;
}
