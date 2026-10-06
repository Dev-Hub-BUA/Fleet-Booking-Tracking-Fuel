const GeoService = (function () {
  'use strict';

  const TILE_URL = 'https://tile.openstreetmap.org/{z}/{x}/{y}.png';
  const ATTRIBUTION = '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a> contributors';
  const NOMINATIM_BASE = 'https://nominatim.openstreetmap.org/search';
  const OSRM_BASE = 'https://router.project-osrm.org/route/v1/driving';

  const STATUS_COLORS = {
    Moving: '#10B981',
    Idle: '#F59E0B',
    Incident: '#EF4444',
    SignalLost: '#94A3B8',
    Departure: '#0B2545',
    Stop: '#1D4E89',
    Return: '#CE9F51',
    Deadhead: '#8B5CF6'
  };

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

  function createTileLayer() {
    if (typeof L === 'undefined') return null;
    return L.tileLayer(TILE_URL, {
      maxZoom: 19,
      attribution: ATTRIBUTION
    });
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
        headers: { 'Accept': 'application/json' }
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

  function calculateDistanceKm(lat1, lng1, lat2, lng2) {
    const R = 6371;
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLng = (lng2 - lng1) * Math.PI / 180;
    const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
              Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
              Math.sin(dLng / 2) * Math.sin(dLng / 2);
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  }

  function createVehicleIcon(status, heading = 0, speed = 0, isStale = false) {
    const color = isStale ? STATUS_COLORS.SignalLost : (STATUS_COLORS[status] || STATUS_COLORS.Moving);
    const pulseHtml = (status === 'Moving' && !isStale)
      ? `<span class="geo-pulse" style="border-color:${color};"></span>`
      : (isStale ? `<span class="geo-pulse geo-pulse-stale"></span>` : '');

    return L.divIcon({
      className: 'geo-vehicle-marker-wrapper',
      html: `
        <div class="geo-vehicle-pin" style="background:${color};">
          ${pulseHtml}
          <div class="geo-vehicle-arrow" style="transform: rotate(${Math.round(heading)}deg);">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="#FFFFFF">
              <path d="M12 2L4 21l8-4 8 4z"/>
            </svg>
          </div>
        </div>
      `,
      iconSize: [32, 32],
      iconAnchor: [16, 16],
      popupAnchor: [0, -16]
    });
  }

  class GeoMapInstance {
    constructor(el, options = {}) {
      this.el = el;
      this.options = options;
      this.markers = [];
      this.routeLayers = [];
      this.legs = [];
      this.vehicleMarkers = new Map();
      this.initMap();
    }

    initMap() {
      if (this.el._leaflet_map) {
        this.leaflet = this.el._leaflet_map;
        return;
      }

      if (!this.el.style.height && !this.el.clientHeight) {
        this.el.style.height = this.options.height || '420px';
      }

      const initialCenter = this.options.center || [27.1809, 31.1837];
      const initialZoom = this.options.zoom || 6;

      this.leaflet = L.map(this.el, {
        center: initialCenter,
        zoom: initialZoom,
        zoomControl: this.options.interactive !== false,
        attributionControl: true
      });
      this.el._leaflet_map = this.leaflet;

      const tile = createTileLayer();
      if (tile) tile.addTo(this.leaflet);

      setTimeout(() => {
        if (this.leaflet) this.leaflet.invalidateSize();
      }, 150);
    }

    clear() {
      this.markers.forEach(m => {
        try { this.leaflet.removeLayer(m); } catch (e) {}
      });
      this.markers = [];

      this.routeLayers.forEach(l => {
        try { this.leaflet.removeLayer(l); } catch (e) {}
      });
      this.routeLayers = [];
      this.legs = [];

      const legend = this.el.querySelector('.itinerary-map-legend');
      if (legend) legend.remove();
    }

    clearVehicles() {
      this.vehicleMarkers.forEach(v => {
        try { this.leaflet.removeLayer(v.marker); } catch (e) {}
      });
      this.vehicleMarkers.clear();
    }

    async drawLegs(legs) {
      if (!Array.isArray(legs)) return;
      const bounds = [];
      legs.forEach(leg => {
        if (leg.coordinates && leg.coordinates.length > 0) {
          const poly = L.polyline(leg.coordinates, {
            color: leg.isReturn ? STATUS_COLORS.Return : (leg.isDeadhead ? STATUS_COLORS.Deadhead : STATUS_COLORS.Departure),
            weight: 4,
            opacity: 0.85,
            dashArray: (leg.isReturn || leg.isDeadhead) ? '8, 8' : (leg.isRealRoute !== false ? undefined : '6, 6')
          }).addTo(this.leaflet);
          this.routeLayers.push(poly);
          leg.coordinates.forEach(c => bounds.push(c));
        }
      });
      if (bounds.length > 0) {
        try {
          this.leaflet.fitBounds(L.latLngBounds(bounds), { padding: [35, 35], maxZoom: 15 });
        } catch (e) {}
      }
    }

    async drawItinerary(points, options = {}) {
      this.clear();

      if (!Array.isArray(points) || points.length === 0) {
        this.leaflet.setView([27.1809, 31.1837], 6);
        return { map: this.leaflet, markers: [], routeLayers: [], legs: [], flyToPoint: () => {} };
      }

      const bounds = [];
      let hasOutbound = false;
      let hasApproxOutbound = false;
      let hasReturn = false;
      let hasDeadhead = false;

      points.forEach((p, idx) => {
        const lat = (typeof p.lat === 'number') ? p.lat : parseFloat(p.lat);
        const lng = (typeof p.lng === 'number') ? p.lng : parseFloat(p.lng);

        if (isNaN(lat) || isNaN(lng)) {
          this.markers.push(null);
          return;
        }

        const num = p.sequence || (idx + 1);
        const isDep = p.type === 'departure';
        const isRet = p.type === 'return';
        const bg = isDep ? STATUS_COLORS.Departure : (isRet ? STATUS_COLORS.Return : STATUS_COLORS.Stop);
        const isApprox = Boolean(!p.pinned || p.approx);
        const border = isApprox ? '2px dashed #DC2626' : '2px solid #FFFFFF';

        const icon = L.divIcon({
          className: 'custom-itinerary-marker',
          html: `<div style="background:${bg}; color:#ffffff; width:28px; height:28px; border-radius:50%; display:flex; align-items:center; justify-content:center; font-weight:800; font-size:12px; border:${border}; box-shadow:0 2px 6px rgba(0,0,0,0.35);">${num}</div>`,
          iconSize: [28, 28],
          iconAnchor: [14, 14],
          popupAnchor: [0, -14]
        });

        const marker = L.marker([lat, lng], { icon: icon }).addTo(this.leaflet);

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
            ${p.arrive_at ? `<div style="font-size:12px;">Arrive: <strong>${escapeHtml(p.arrive_at)}</strong></div>` : ''}
            ${p.depart_at ? `<div style="font-size:12px;">Depart: <strong>${escapeHtml(p.depart_at)}</strong></div>` : ''}
            ${p.notes ? `<div style="font-size:11.5px; color:#475569; margin-top:6px; padding-top:4px; border-top:1px dashed #CBD5E1;">Note: ${escapeHtml(p.notes)}</div>` : ''}
          </div>
        `;
        marker.bindPopup(popupHtml);

        this.markers.push(marker);
        bounds.push([lat, lng]);
      });

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
              color: isReturnLeg ? STATUS_COLORS.Return : STATUS_COLORS.Departure,
              weight: 4,
              opacity: 0.85,
              dashArray: isReturnLeg ? '8, 8' : (isReal ? undefined : '6, 6')
            }).addTo(this.leaflet);

            this.routeLayers.push(poly);
            route.coordinates.forEach(c => bounds.push(c));

            this.legs.push({
              from_index: i,
              to_index: i + 1,
              distance_km: route.distance_km,
              drive_minutes: route.drive_minutes,
              isRealRoute: isReal,
              source: isReal ? '(route)' : '(est.)',
              coordinates: route.coordinates,
              isReturn: isReturnLeg
            });
          }
        }
      }

      if (options.deadhead && options.deadhead.to_coords) {
        const lastPt = points[points.length - 1];
        if (lastPt && !isNaN(lastPt.lat) && !isNaN(lastPt.lng)) {
          const dhRoute = await getRouteBetweenPoints(
            { lat: Number(lastPt.lat), lng: Number(lastPt.lng) },
            options.deadhead.to_coords
          );
          if (dhRoute && dhRoute.coordinates) {
            hasDeadhead = true;
            const dhPoly = L.polyline(dhRoute.coordinates, {
              color: STATUS_COLORS.Deadhead,
              weight: 3.5,
              opacity: 0.85,
              dashArray: '5, 8'
            }).addTo(this.leaflet);
            this.routeLayers.push(dhPoly);
            dhRoute.coordinates.forEach(c => bounds.push(c));
          }
        }
      }

      const oldLegend = this.el.querySelector('.itinerary-map-legend');
      if (oldLegend) oldLegend.remove();

      if (hasOutbound || hasApproxOutbound || hasReturn || hasDeadhead) {
        const legendEl = document.createElement('div');
        legendEl.className = 'itinerary-map-legend';
        legendEl.style.cssText = 'position:absolute; bottom:8px; right:8px; background:rgba(255,255,255,0.92); border-radius:4px; padding:4px 8px; font-size:11px; font-weight:600; color:#0B2545; display:flex; align-items:center; gap:8px; z-index:500; pointer-events:none; border:1px solid #CBD5E1;';

        let legendHtml = '';
        if (hasOutbound) {
          legendHtml += `<span style="display:inline-flex; align-items:center; gap:4px;"><span style="display:inline-block; width:12px; height:3px; background:${STATUS_COLORS.Departure};"></span> Outbound</span>`;
        }
        if (hasApproxOutbound) {
          legendHtml += `<span style="display:inline-flex; align-items:center; gap:4px;"><span style="display:inline-block; width:12px; height:3px; border-top:2px dashed ${STATUS_COLORS.Departure};"></span> Approx.</span>`;
        }
        if (hasReturn) {
          legendHtml += `<span style="display:inline-flex; align-items:center; gap:4px;"><span style="display:inline-block; width:12px; height:3px; border-top:2px dashed ${STATUS_COLORS.Return};"></span> Return</span>`;
        }
        if (hasDeadhead) {
          legendHtml += `<span style="display:inline-flex; align-items:center; gap:4px;"><span style="display:inline-block; width:12px; height:3px; border-top:2px dashed ${STATUS_COLORS.Deadhead};"></span> Deadhead</span>`;
        }
        legendEl.innerHTML = legendHtml;
        this.el.appendChild(legendEl);
      }

      if (bounds.length === 1) {
        this.leaflet.setView(bounds[0], 13);
      } else if (bounds.length > 1) {
        try {
          const latLngBounds = L.latLngBounds(bounds);
          if (latLngBounds.isValid()) {
            this.leaflet.fitBounds(latLngBounds, { padding: [35, 35], maxZoom: 15 });
          }
        } catch (e) {}
      }

      setTimeout(() => {
        if (this.leaflet) this.leaflet.invalidateSize();
      }, 150);

      if (typeof options.onLegsComputed === 'function') {
        options.onLegsComputed(this.legs);
      }

      const self = this;
      return {
        map: this.leaflet,
        markers: this.markers,
        routeLayers: this.routeLayers,
        legs: this.legs,
        flyToPoint: (index) => self.focusPoint(index)
      };
    }

    setVehicle(id, data = {}) {
      const lat = Number(data.lat);
      const lng = Number(data.lng);
      if (isNaN(lat) || isNaN(lng)) return null;

      const heading = Number(data.heading) || 0;
      const speed = Number(data.speed_kmh || data.speed || 0);
      const status = data.status || (speed > 3 ? 'Moving' : 'Idle');
      const isStale = Boolean(data.is_stale);
      const label = data.label || id;

      let entry = this.vehicleMarkers.get(id);
      const icon = createVehicleIcon(status, heading, speed, isStale);

      if (entry) {
        entry.marker.setLatLng([lat, lng]);
        entry.marker.setIcon(icon);
        entry.marker.setTooltipContent(`${escapeHtml(label)} · ${speed} km/h`);
      } else {
        const marker = L.marker([lat, lng], { icon, zIndexOffset: 1000 }).addTo(this.leaflet);
        marker.bindTooltip(`${escapeHtml(label)} · ${speed} km/h`, {
          permanent: false,
          direction: 'top',
          offset: [0, -16],
          className: 'itinerary-map-tooltip'
        });

        if (typeof this.options.onVehicleClick === 'function') {
          marker.on('click', () => {
            this.options.onVehicleClick(id, data);
          });
        }

        entry = { marker, data };
        this.vehicleMarkers.set(id, entry);
      }

      const popupHtml = `
        <div style="font-size:13px; min-width:180px; padding:4px;">
          <strong style="color:#0B2545; font-size:14px; display:block;">${escapeHtml(label)}</strong>
          <div style="font-size:11.5px; color:#64748B; margin-top:2px;">Status: <strong style="color:${STATUS_COLORS[status] || '#0B2545'}">${escapeHtml(status)}</strong></div>
          <div style="font-size:12px; margin-top:4px;">Speed: <strong>${speed} km/h</strong></div>
          ${data.driver_name ? `<div style="font-size:12px;">Driver: <strong>${escapeHtml(data.driver_name)}</strong></div>` : ''}
          ${data.booking_id ? `<div style="font-size:12px;">Mission: <strong>${escapeHtml(data.booking_id)}</strong></div>` : ''}
          ${data.remaining_min ? `<div style="font-size:12px;">ETA Remaining: <strong>${escapeHtml(data.remaining_min)} min</strong></div>` : ''}
        </div>
      `;
      entry.marker.bindPopup(popupHtml);
      entry.data = data;
      return entry.marker;
    }

    setVehicles(list) {
      if (!Array.isArray(list)) return;
      const currentIds = new Set(list.map(v => v.id || v.vehicle_id));

      this.vehicleMarkers.forEach((entry, id) => {
        if (!currentIds.has(id)) {
          try { this.leaflet.removeLayer(entry.marker); } catch (e) {}
          this.vehicleMarkers.delete(id);
        }
      });

      list.forEach(v => {
        const id = v.id || v.vehicle_id;
        if (id) this.setVehicle(id, v);
      });
    }

    focusPoint(index) {
      if (this.markers[index]) {
        this.leaflet.flyTo(this.markers[index].getLatLng(), 14, { duration: 0.8 });
        this.markers[index].openPopup();
      }
    }

    focusVehicle(id) {
      const entry = this.vehicleMarkers.get(id);
      if (entry) {
        this.leaflet.flyTo(entry.marker.getLatLng(), 14, { duration: 0.8 });
        entry.marker.openPopup();
      }
    }

    fitAll() {
      const bounds = [];
      this.markers.forEach(m => {
        if (m) bounds.push(m.getLatLng());
      });
      this.vehicleMarkers.forEach(v => {
        if (v && v.marker) bounds.push(v.marker.getLatLng());
      });
      if (bounds.length > 0) {
        try {
          this.leaflet.fitBounds(L.latLngBounds(bounds), { padding: [40, 40], maxZoom: 15 });
        } catch (e) {}
      }
    }

    invalidateSize() {
      if (this.leaflet) this.leaflet.invalidateSize();
    }
  }

  function progress(routeGeometry, position) {
    if (!Array.isArray(routeGeometry) || routeGeometry.length === 0 || !position) {
      return { remaining_km: 0, remaining_min: 0, next_point_index: 0, current_point_index: 0 };
    }

    const posLat = Number(position.lat);
    const posLng = Number(position.lng);
    let minDistance = Infinity;
    let closestIndex = 0;

    for (let i = 0; i < routeGeometry.length; i++) {
      const pt = routeGeometry[i];
      const ptLat = Array.isArray(pt) ? pt[0] : pt.lat;
      const ptLng = Array.isArray(pt) ? pt[1] : pt.lng;
      const d = calculateDistanceKm(posLat, posLng, ptLat, ptLng);
      if (d < minDistance) {
        minDistance = d;
        closestIndex = i;
      }
    }

    let remainingKm = 0;
    for (let i = closestIndex; i < routeGeometry.length - 1; i++) {
      const pA = routeGeometry[i];
      const pB = routeGeometry[i + 1];
      const latA = Array.isArray(pA) ? pA[0] : pA.lat;
      const lngA = Array.isArray(pA) ? pA[1] : pA.lng;
      const latB = Array.isArray(pB) ? pB[0] : pB.lat;
      const lngB = Array.isArray(pB) ? pB[1] : pB.lng;
      remainingKm += calculateDistanceKm(latA, lngA, latB, lngB);
    }

    const speed = Math.max(Number(position.speed_kmh || position.speed || 65), 35);
    const remainingMin = Math.round((remainingKm / speed) * 60);

    return {
      remaining_km: Math.round(remainingKm * 10) / 10,
      remaining_min: remainingMin,
      current_point_index: closestIndex,
      next_point_index: Math.min(closestIndex + 1, routeGeometry.length - 1)
    };
  }

  let locationPickerModalPromise = null;
  let locationPickerResolver = null;
  let locationPickerMap = null;
  let locationPickerMarker = null;
  let locationPickerState = { lat: 27.1809, lng: 31.1837, place_name: '' };

  function ensurePickerModalDom() {
    if (document.getElementById('geomap-picker-modal')) return;

    const overlay = document.createElement('div');
    overlay.id = 'geomap-picker-modal';
    overlay.className = 'geo-modal-overlay';
    overlay.style.cssText = 'position:fixed; inset:0; background:rgba(15,23,42,0.65); backdrop-filter:blur(3px); z-index:10000; display:none; align-items:center; justify-content:center; padding:16px; font-family:system-ui,-apple-system,sans-serif;';
    overlay.innerHTML = `
      <div style="background:#FFFFFF; border-radius:8px; max-width:640px; width:100%; border:1px solid #CBD5E1; box-shadow:0 25px 50px -12px rgba(0,0,0,0.25); display:flex; flex-direction:column; overflow:hidden;">
        <div style="padding:14px 18px; border-bottom:1px solid #E2E8F0; display:flex; justify-content:space-between; align-items:center;">
          <h3 style="margin:0; font-size:15px; font-weight:700; color:#0B2545; display:flex; align-items:center; gap:8px;">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#CE9F51" stroke-width="2"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg>
            Pick Location on Map
          </h3>
          <button type="button" id="geomap-picker-btn-close" style="border:none; background:transparent; cursor:pointer; color:#64748B; padding:4px;" aria-label="Close dialog">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
          </button>
        </div>
        <div style="padding:14px 18px; display:flex; flex-direction:column; gap:10px;">
          <div style="display:flex; gap:8px; position:relative;">
            <input type="text" id="geomap-picker-input-search" placeholder="Search address, campus or landmark in Egypt…" style="flex:1; padding:8px 12px; border:1px solid #CBD5E1; border-radius:6px; font-size:13px;">
            <button type="button" id="geomap-picker-btn-search" style="padding:8px 14px; background:#0B2545; color:#FFFFFF; border:none; border-radius:6px; font-size:13px; font-weight:600; cursor:pointer;">
              Search
            </button>
          </div>
          <div id="geomap-picker-search-results" style="display:none; max-height:120px; overflow-y:auto; border:1px solid #CBD5E1; border-radius:6px; background:#FFFFFF; font-size:12.5px;"></div>
          <div id="geomap-picker-leaflet-map" style="height:320px; border-radius:6px; border:1px solid #CBD5E1; position:relative;"></div>
          <div style="display:flex; justify-content:space-between; align-items:center; background:#F8FAFC; padding:8px 12px; border-radius:6px; border:1px solid #E2E8F0; font-size:12.5px;">
            <div>
              <span style="color:#64748B;">Place:</span> <strong id="geomap-picker-label-name" style="color:#0B2545;">Selected Location</strong>
            </div>
            <div>
              <span style="color:#64748B;">Coords:</span> <strong id="geomap-picker-label-coords" style="font-family:monospace; color:#0B2545;">27.180900, 31.183700</strong>
            </div>
          </div>
        </div>
        <div style="padding:12px 18px; background:#F1F5F9; border-top:1px solid #E2E8F0; display:flex; justify-content:flex-end; gap:10px;">
          <button type="button" id="geomap-picker-btn-cancel" style="padding:7px 14px; border:1px solid #CBD5E1; background:#FFFFFF; border-radius:6px; font-size:13px; font-weight:600; cursor:pointer; color:#334155;">
            Cancel
          </button>
          <button type="button" id="geomap-picker-btn-confirm" style="padding:7px 16px; border:none; background:#CE9F51; color:#0B2545; border-radius:6px; font-size:13px; font-weight:700; cursor:pointer;">
            Use this location
          </button>
        </div>
      </div>
    `;
    document.body.appendChild(overlay);

    function updatePickerPosition(lat, lng, name) {
      locationPickerState.lat = Number(Number(lat).toFixed(6));
      locationPickerState.lng = Number(Number(lng).toFixed(6));
      if (name) {
        locationPickerState.place_name = name;
        document.getElementById('geomap-picker-label-name').textContent = name;
        document.getElementById('geomap-picker-input-search').value = name;
      }
      document.getElementById('geomap-picker-label-coords').textContent = `${locationPickerState.lat.toFixed(6)}, ${locationPickerState.lng.toFixed(6)}`;
      if (locationPickerMarker) {
        locationPickerMarker.setLatLng([locationPickerState.lat, locationPickerState.lng]);
      }
      if (locationPickerMap) {
        locationPickerMap.panTo([locationPickerState.lat, locationPickerState.lng]);
      }
    }

    async function executeSearch() {
      const q = (document.getElementById('geomap-picker-input-search').value || '').trim();
      if (!q) return;
      const resContainer = document.getElementById('geomap-picker-search-results');
      resContainer.innerHTML = '<div style="padding:8px; color:#64748B;">Searching…</div>';
      resContainer.style.display = 'block';

      const results = await searchNominatim(q, true);
      if (!results || results.length === 0) {
        resContainer.innerHTML = '<div style="padding:8px; color:#64748B;">No matching locations found.</div>';
        return;
      }

      resContainer.innerHTML = results.map((item, idx) => `
        <div data-idx="${idx}" style="padding:7px 10px; cursor:pointer; border-bottom:1px solid #F1F5F9; hover:background:#F8FAFC;">
          <strong>${escapeHtml(item.name)}</strong>
          <div style="font-size:11px; color:#64748B;">${escapeHtml(item.fullAddress)}</div>
        </div>
      `).join('');

      resContainer.querySelectorAll('div[data-idx]').forEach(row => {
        row.addEventListener('click', () => {
          const idx = parseInt(row.getAttribute('data-idx'), 10);
          const sel = results[idx];
          resContainer.style.display = 'none';
          updatePickerPosition(sel.lat, sel.lng, sel.name);
          if (locationPickerMap) locationPickerMap.setView([sel.lat, sel.lng], 14);
        });
      });
    }

    document.getElementById('geomap-picker-btn-search').addEventListener('click', executeSearch);
    document.getElementById('geomap-picker-input-search').addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        executeSearch();
      }
    });

    const closeHandler = () => {
      overlay.style.display = 'none';
      if (locationPickerResolver) {
        locationPickerResolver(null);
        locationPickerResolver = null;
      }
    };

    document.getElementById('geomap-picker-btn-close').addEventListener('click', closeHandler);
    document.getElementById('geomap-picker-btn-cancel').addEventListener('click', closeHandler);

    document.getElementById('geomap-picker-btn-confirm').addEventListener('click', () => {
      overlay.style.display = 'none';
      if (locationPickerResolver) {
        locationPickerResolver({
          lat: Number(locationPickerState.lat.toFixed(6)),
          lng: Number(locationPickerState.lng.toFixed(6)),
          place_name: locationPickerState.place_name || 'Selected Location',
          pinned: true
        });
        locationPickerResolver = null;
      }
    });
  }

  function pickLocation(initial = {}) {
    ensurePickerModalDom();

    const overlay = document.getElementById('geomap-picker-modal');
    overlay.style.display = 'flex';

    locationPickerState.lat = typeof initial.lat === 'number' ? initial.lat : 27.1809;
    locationPickerState.lng = typeof initial.lng === 'number' ? initial.lng : 31.1837;
    locationPickerState.place_name = initial.place_name || initial.name || 'Selected Location';

    document.getElementById('geomap-picker-input-search').value = locationPickerState.place_name;
    document.getElementById('geomap-picker-label-name').textContent = locationPickerState.place_name;
    document.getElementById('geomap-picker-label-coords').textContent = `${locationPickerState.lat.toFixed(6)}, ${locationPickerState.lng.toFixed(6)}`;
    document.getElementById('geomap-picker-search-results').style.display = 'none';

    setTimeout(() => {
      const container = document.getElementById('geomap-picker-leaflet-map');
      if (!locationPickerMap) {
        locationPickerMap = L.map(container, { attributionControl: true }).setView([locationPickerState.lat, locationPickerState.lng], 13);
        const tile = createTileLayer();
        if (tile) tile.addTo(locationPickerMap);

        locationPickerMarker = L.marker([locationPickerState.lat, locationPickerState.lng], { draggable: true }).addTo(locationPickerMap);

        locationPickerMarker.on('dragend', (e) => {
          const pos = e.target.getLatLng();
          locationPickerState.lat = pos.lat;
          locationPickerState.lng = pos.lng;
          document.getElementById('geomap-picker-label-coords').textContent = `${pos.lat.toFixed(6)}, ${pos.lng.toFixed(6)}`;
        });

        locationPickerMap.on('click', (e) => {
          locationPickerMarker.setLatLng(e.latlng);
          locationPickerState.lat = e.latlng.lat;
          locationPickerState.lng = e.latlng.lng;
          document.getElementById('geomap-picker-label-coords').textContent = `${e.latlng.lat.toFixed(6)}, ${e.latlng.lng.toFixed(6)}`;
        });
      } else {
        locationPickerMap.invalidateSize();
        locationPickerMap.setView([locationPickerState.lat, locationPickerState.lng], 13);
        locationPickerMarker.setLatLng([locationPickerState.lat, locationPickerState.lng]);
      }
    }, 100);

    return new Promise((resolve) => {
      locationPickerResolver = resolve;
    });
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
        .geo-vehicle-marker-wrapper {
          background: transparent !important;
          border: none !important;
        }
        .geo-vehicle-pin {
          width: 30px;
          height: 30px;
          border-radius: 50%;
          border: 2px solid #FFFFFF;
          box-shadow: 0 3px 8px rgba(0,0,0,0.35);
          display: flex;
          align-items: center;
          justify-content: center;
          position: relative;
        }
        .geo-vehicle-arrow {
          display: flex;
          align-items: center;
          justify-content: center;
          transition: transform 0.3s ease;
        }
        .geo-pulse {
          position: absolute;
          inset: -6px;
          border-radius: 50%;
          border: 2px solid #10B981;
          animation: geoPulseAnim 2s infinite;
          pointer-events: none;
        }
        .geo-pulse-stale {
          border-color: #F59E0B !important;
          animation: geoPulseAnim 1.5s infinite;
        }
        @keyframes geoPulseAnim {
          0% { transform: scale(0.9); opacity: 0.9; }
          70% { transform: scale(1.6); opacity: 0; }
          100% { transform: scale(1.6); opacity: 0; }
        }
      `;
      document.head.appendChild(style);
    }
  }

  const GeoMap = {
    create: function (elOrId, options = {}) {
      const el = (typeof elOrId === 'string') ? document.getElementById(elOrId) : elOrId;
      if (!el) return null;
      return new GeoMapInstance(el, options);
    },
    pickLocation,
    STATUS_COLORS
  };

  const GeoRoute = {
    progress,
    getRouteBetweenPoints,
    calculateDistanceKm
  };

  async function drawItineraryMap(elOrId, points, options = {}) {
    const map = GeoMap.create(elOrId, options);
    if (!map) return null;
    return await map.drawItinerary(points, options);
  }

  return {
    TILE_URL,
    ATTRIBUTION,
    STATUS_COLORS,
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
    formatCoordKey,
    GeoMap,
    GeoRoute
  };
})();

if (typeof window !== 'undefined') {
  window.GeoService = GeoService;
  window.GeoMap = GeoService.GeoMap;
  window.GeoRoute = GeoService.GeoRoute;
  window.drawItineraryMap = GeoService.drawItineraryMap;
}
