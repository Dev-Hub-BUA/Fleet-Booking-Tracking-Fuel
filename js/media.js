(function (global) {
  'use strict';

  const DB_NAME = 'cira_fleet_media_db';
  const DB_VERSION = 1;
  const STORE_NAME = 'media';
  const urlCache = new Map();
  const memoryFallback = new Map();

  function openDatabase() {
    return new Promise((resolve, reject) => {
      if (typeof indexedDB === 'undefined') {
        return reject(new Error('IndexedDB not supported'));
      }
      const request = indexedDB.open(DB_NAME, DB_VERSION);
      request.onupgradeneeded = function (event) {
        const db = event.target.result;
        if (!db.objectStoreNames.contains(STORE_NAME)) {
          db.createObjectStore(STORE_NAME, { keyPath: 'id' });
        }
      };
      request.onsuccess = function (event) {
        resolve(event.target.result);
      };
      request.onerror = function (event) {
        reject(event.target.error);
      };
    });
  }

  const Media = {
    save: async function (blob, meta = {}) {
      const id = 'IMG-' + Date.now() + '-' + Math.random().toString(36).substring(2, 8).toUpperCase();
      const record = {
        id: id,
        booking_id: meta.booking_id || null,
        kind: meta.kind || 'general',
        taken_at: meta.taken_at || new Date().toISOString(),
        lat: meta.lat !== undefined ? meta.lat : null,
        lng: meta.lng !== undefined ? meta.lng : null,
        by_user_id: meta.by_user_id || null,
        blob: blob
      };

      try {
        const db = await openDatabase();
        await new Promise((resolve, reject) => {
          const tx = db.transaction([STORE_NAME], 'readwrite');
          const store = tx.objectStore(STORE_NAME);
          const req = store.put(record);
          req.onsuccess = () => resolve(id);
          req.onerror = () => reject(req.error);
        });
      } catch (err) {
        memoryFallback.set(id, record);
      }

      if (blob && typeof URL !== 'undefined') {
        urlCache.set(id, URL.createObjectURL(blob));
      }

      return id;
    },

    get: async function (id) {
      if (!id) return null;
      if (memoryFallback.has(id)) {
        return memoryFallback.get(id);
      }
      try {
        const db = await openDatabase();
        return await new Promise((resolve, reject) => {
          const tx = db.transaction([STORE_NAME], 'readonly');
          const store = tx.objectStore(STORE_NAME);
          const req = store.get(id);
          req.onsuccess = () => resolve(req.result || null);
          req.onerror = () => reject(req.error);
        });
      } catch (err) {
        return memoryFallback.get(id) || null;
      }
    },

    getUrl: async function (id) {
      if (!id) return '';
      if (urlCache.has(id)) {
        return urlCache.get(id);
      }
      const record = await this.get(id);
      if (!record || !record.blob) return '';
      const url = URL.createObjectURL(record.blob);
      urlCache.set(id, url);
      return url;
    }
  };

  global.Media = Media;
})(typeof window !== 'undefined' ? window : this);
