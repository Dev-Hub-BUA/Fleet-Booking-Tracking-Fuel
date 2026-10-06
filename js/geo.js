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

  function formatShortDateTime(dtStr) {
    if (!dtStr) return '';
    try {
      const parts = dtStr.trim().split(' ');
      if (parts.length >= 2 && parts[0].includes('-')) {
        const d = new Date(parts[0] + 'T' + parts[1]);
        if (!isNaN(d.getTime())) {
          return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }) + ' ' + parts[1];
        }
      }
      return dtStr;
    } catch (e) {
      return dtStr;
    }
  }

  async function searchNominatim(query, allowFallback = false) {
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
        lat: Number(parseFloat(item.lat).toFixed(6)),
        lng: Number(parseFloat(item.lon).toFixed(6))
      }));
      nominatimCache.set(cacheKey, results);
      return results;
    } catch (err) {
      if (allowFallback && window.FleetStore && window.FleetStore.RouteEstimator) {
        const found = window.FleetStore.RouteEstimator.locations.filter(l =>
          l.name.toLowerCase().includes(cacheKey) || (l.city && l.city.toLowerCase().includes(cacheKey))
        );
        return found.map(f => ({
          name: f.name,
          fullAddress: `${f.name}, ${f.city || 'Egypt'}`,
          lat: Number(f.lat.toFixed(6)),
          lng: Number(f.lng.toFixed(6))
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

  function escapeHtml(str) {
    if (!str) return '';
    return String(str).replace(/[&<>"']/g, function (m) {
      return {
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#39;'
      }[m];
    });
  }

  async function drawItineraryMap(elOrId, points, options = {}) {
    if (typeof L === 'undefined') return null;

    const el = (typeof elOrId === 'string') ? document.getElementById(elOrId) : elOrId;
    if (!el) return null;

    if (!el.style.height && !el.clientHeight) {
      el.style.height = options.height || '420px';
    }

    let map = el._leaflet_map;
    if (!map) {
      map = L.map(el, {
        zoomControl: options.interactive !== false,
        attributionControl: true
      });
      el._leaflet_map = map;
      const tile = createTileLayer();
      if (tile) tile.addTo(map);
    }

    if (el._leaflet_layers) {
      el._leaflet_layers.forEach(layer => {
        try { map.removeLayer(layer); } catch (e) {}
      });
    }
    el._leaflet_layers = [];

    if (!Array.isArray(points) || points.length === 0) {
      map.setView([27.1809, 31.1837], 6);
      return { map, markers: [], routeLayers: [], legs: [], flyToPoint: () => {} };
    }

    const markers = [];
    const routeLayers = [];
    const bounds = [];
    let hasOutbound = false;
    let hasApproxOutbound = false;
    let hasReturn = false;

    points.forEach((p, idx) => {
      const lat = (typeof p.lat === 'number') ? p.lat : parseFloat(p.lat);
      const lng = (typeof p.lng === 'number') ? p.lng : parseFloat(p.lng);

      if (isNaN(lat) || isNaN(lng)) {
        markers.push(null);
        return;
      }

      const num = p.sequence || (idx + 1);
      const isDep = p.type === 'departure';
      const isRet = p.type === 'return';
      const bg = isDep ? '#0B2545' : (isRet ? '#D4AF37' : '#1D4E89');
      const isApprox = Boolean(!p.pinned || p.approx);
      const border = isApprox ? '2px dashed #DC2626' : '2px solid #FFFFFF';

      const icon = L.divIcon({
        className: 'custom-itinerary-marker',
        html: `<div style="background:${bg}; color:#ffffff; width:28px; height:28px; border-radius:50%; display:flex; align-items:center; justify-content:center; font-weight:800; font-size:12px; border:${border}; box-shadow:0 2px 6px rgba(0,0,0,0.35);">${num}</div>`,
        iconSize: [28, 28],
        iconAnchor: [14, 14],
        popupAnchor: [0, -14]
      });

      const marker = L.marker([lat, lng], { icon: icon }).addTo(map);
      el._leaflet_layers.push(marker);

      const labelPlace = p.place_name || p.name || (isDep ? 'Departure' : (isRet ? 'Return' : `Stop #${num}`));
      const timeStr = p.depart_at || p.arrive_at || '';
      const formattedTime = formatShortDateTime(timeStr);
      const approxText = isApprox ? ' (approx.)' : '';
      const tooltipContent = formattedTime
        ? `${num} · ${labelPlace} · ${formattedTime}${approxText}`
        : `${num} · ${labelPlace}${approxText}`;

      marker.bindTooltip(tooltipContent, {
        permanent: true,
        direction: 'right',
        offset: [14, 0],
        className: 'itinerary-map-tooltip'
      });

      const typeLabel = isDep ? 'Departure Point' : (isRet ? 'Return Point' : `Stop #${num}`);
      const popupHtml = `
        <div style="font-size:13px; min-width:190px; padding:2px;">
          <strong style="color:#0B2545; font-size:14px; display:block; margin-bottom:4px;">${num}. ${escapeHtml(labelPlace)}</strong>
          <div style="font-size:11.5px; color:#64748B; margin-bottom:4px;">Type: <strong>${typeLabel}</strong>${approxText}</div>
          ${p.arrive_at ? `<div style="font-size:12px;">Arrive: <strong>${p.arrive_at}</strong></div>` : ''}
          ${p.depart_at ? `<div style="font-size:12px;">Depart: <strong>${p.depart_at}</strong></div>` : ''}
          ${p.notes ? `<div style="font-size:11.5px; color:#475569; margin-top:6px; padding-top:4px; border-top:1px dashed #CBD5E1;">Note: ${escapeHtml(p.notes)}</div>` : ''}
        </div>
      `;
      marker.bindPopup(popupHtml);

      markers.push(marker);
      bounds.push([lat, lng]);
    });

    const computedLegs = [];
    const returnWithVehicle = options.returnWithVehicle !== undefined
      ? options.returnWithVehicle
      : points.some(p => p.type === 'return');

    for (let i = 0; i < points.length - 1; i++) {
      const p1 = points[i];
      const p2 = points[i + 1];
      const isReturnLeg = (p2.type === 'return' || (i === points.length - 2 && returnWithVehicle));

      const lat1 = (typeof p1.lat === 'number') ? p1.lat : parseFloat(p1.lat);
      const lng1 = (typeof p1.lng === 'number') ? p1.lng : parseFloat(p1.lng);
      const lat2 = (typeof p2.lat === 'number') ? p2.lat : parseFloat(p2.lat);
      const lng2 = (typeof p2.lng === 'number') ? p2.lng : parseFloat(p2.lng);

      if (!isNaN(lat1) && !isNaN(lng1) && !isNaN(lat2) && !isNaN(lng2)) {
        let route = null;
        try {
          route = await getRouteBetweenPoints({ lat: lat1, lng: lng1 }, { lat: lat2, lng: lng2 });
        } catch (e) {
          route = null;
        }

        if (route && route.coordinates && route.coordinates.length > 0) {
          const isReal = route.isRealRoute !== false;
          if (isReturnLeg) {
            hasReturn = true;
          } else {
            if (isReal) hasOutbound = true;
            else hasApproxOutbound = true;
          }

          const poly = L.polyline(route.coordinates, {
            color: isReturnLeg ? '#D4AF37' : '#0B2545',
            weight: 4,
            opacity: 0.85,
            dashArray: isReturnLeg ? '8, 8' : (isReal ? undefined : '6, 6')
          }).addTo(map);

          el._leaflet_layers.push(poly);
          routeLayers.push(poly);
          route.coordinates.forEach(c => bounds.push(c));

          computedLegs.push({
            from_index: i,
            to_index: i + 1,
            distance_km: route.distance_km,
            drive_minutes: route.drive_minutes,
            isRealRoute: isReal,
            source: isReal ? '(route)' : '(est.)',
            coordinates: route.coordinates
          });
        } else {
          if (isReturnLeg) hasReturn = true;
          else hasApproxOutbound = true;

          const poly = L.polyline([[lat1, lng1], [lat2, lng2]], {
            color: isReturnLeg ? '#D4AF37' : '#0B2545',
            weight: 3,
            opacity: 0.7,
            dashArray: isReturnLeg ? '8, 8' : '6, 6'
          }).addTo(map);

          el._leaflet_layers.push(poly);
          routeLayers.push(poly);
          bounds.push([lat1, lng1], [lat2, lng2]);

          computedLegs.push({
            from_index: i,
            to_index: i + 1,
            distance_km: 100,
            drive_minutes: 80,
            isRealRoute: false,
            source: '(est.)',
            coordinates: [[lat1, lng1], [lat2, lng2]]
          });
        }
      }
    }

    const oldLegend = el.querySelector('.itinerary-map-legend');
    if (oldLegend) oldLegend.remove();

    if (hasOutbound || hasApproxOutbound || hasReturn) {
      const legendEl = document.createElement('div');
      legendEl.className = 'itinerary-map-legend';
      legendEl.style.cssText = 'position:absolute; bottom:8px; right:8px; background:rgba(255,255,255,0.92); border-radius:4px; padding:4px 8px; font-size:11px; font-weight:600; color:#0B2545; display:flex; align-items:center; gap:8px; z-index:500; pointer-events:none; border:1px solid #CBD5E1;';

      let legendHtml = '';
      if (hasOutbound) {
        legendHtml += '<span style="display:inline-flex; align-items:center; gap:4px;"><span style="display:inline-block; width:12px; height:3px; background:#0B2545;"></span> Outbound</span>';
      }
      if (hasApproxOutbound) {
        legendHtml += '<span style="display:inline-flex; align-items:center; gap:4px;"><span style="display:inline-block; width:12px; height:3px; border-top:2px dashed #0B2545;"></span> Approx.</span>';
      }
      if (hasReturn) {
        legendHtml += '<span style="display:inline-flex; align-items:center; gap:4px;"><span style="display:inline-block; width:12px; height:3px; border-top:2px dashed #D4AF37;"></span> Return</span>';
      }
      legendEl.innerHTML = legendHtml;
      el.appendChild(legendEl);
    }

    if (bounds.length === 1) {
      map.setView(bounds[0], 13);
    } else if (bounds.length > 1) {
      try {
        const latLngBounds = L.latLngBounds(bounds);
        if (latLngBounds.isValid()) {
          map.fitBounds(latLngBounds, { padding: [35, 35], maxZoom: 15 });
        }
      } catch (e) {}
    }

    setTimeout(() => {
      if (map) map.invalidateSize();
    }, 150);

    if (typeof options.onLegsComputed === 'function') {
      options.onLegsComputed(computedLegs);
    }

    function flyToPoint(index) {
      if (markers[index]) {
        map.flyTo(markers[index].getLatLng(), 14, { duration: 0.8 });
        markers[index].openPopup();
      }
    }

    return {
      map,
      markers,
      routeLayers,
      legs: computedLegs,
      flyToPoint
    };
  }

  if (typeof document !== 'undefined') {
    const styleId = 'geo-service-styles';
    if (!document.getElementById(styleId)) {
      const style = document.createElement('style');
      style.id = styleId;
      style.textContent = `
        .itinerary-map-tooltip {
          background: #FFFFFF !important;
          color: #0B2545 !important;
          border: 1px solid #CBD5E1 !important;
          border-radius: 4px !important;
          font-size: 11px !important;
          font-weight: 700 !important;
          padding: 2px 6px !important;
          box-shadow: 0 2px 5px rgba(0,0,0,0.15) !important;
          white-space: nowrap !important;
        }
        .itinerary-map-tooltip::before {
          border-right-color: #CBD5E1 !important;
        }
      `;
      document.head.appendChild(style);
    }
  }

  return {
    TILE_URL,
    ATTRIBUTION,
    searchNominatim,
    geocode: async function (query) {
      const results = await searchNominatim(query, false);
      if (results && results.length > 0) {
        return {
          lat: Number(results[0].lat.toFixed(6)),
          lng: Number(results[0].lng.toFixed(6)),
          placeName: results[0].name
        };
      }
      return null;
    },
    getRouteBetweenPoints,
    createTileLayer,
    drawItineraryMap,
    formatCoordKey
  };
})();

if (typeof window !== 'undefined') {
  window.GeoService = GeoService;
  window.drawItineraryMap = GeoService.drawItineraryMap;
}
