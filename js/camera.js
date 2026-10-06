(function (global) {
  'use strict';

  function getCurrentGps() {
    return new Promise((resolve) => {
      if (!navigator.geolocation) {
        return resolve({ lat: 30.027600, lng: 31.208900 });
      }
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          resolve({
            lat: Number(pos.coords.latitude.toFixed(6)),
            lng: Number(pos.coords.longitude.toFixed(6))
          });
        },
        () => {
          resolve({ lat: 30.027600, lng: 31.208900 });
        },
        { timeout: 3000, maximumAge: 30000 }
      );
    });
  }

  function resizeAndStampCanvas(sourceCanvas, meta, maxDim = 800) {
    let targetWidth = sourceCanvas.width;
    let targetHeight = sourceCanvas.height;

    if (targetWidth > maxDim || targetHeight > maxDim) {
      if (targetWidth > targetHeight) {
        targetHeight = Math.round((targetHeight * maxDim) / targetWidth);
        targetWidth = maxDim;
      } else {
        targetWidth = Math.round((targetWidth * maxDim) / targetHeight);
        targetHeight = maxDim;
      }
    }

    const outputCanvas = document.createElement('canvas');
    outputCanvas.width = targetWidth;
    outputCanvas.height = targetHeight;
    const ctx = outputCanvas.getContext('2d');

    ctx.drawImage(sourceCanvas, 0, 0, targetWidth, targetHeight);

    const barHeight = Math.max(32, Math.round(targetHeight * 0.08));
    ctx.fillStyle = 'rgba(15, 23, 42, 0.85)';
    ctx.fillRect(0, targetHeight - barHeight, targetWidth, barHeight);

    const now = new Date();
    const dateStr = now.toISOString().replace('T', ' ').substring(0, 19) + ' (+03:00)';
    const kindStr = (meta.kind || 'PROOF').toUpperCase();
    const bookingStr = meta.booking_id || 'FLEET';
    const gpsStr = `GPS: ${Number(meta.lat || 30.0276).toFixed(5)}, ${Number(meta.lng || 31.2089).toFixed(5)}`;

    const stampText = `[${bookingStr}] ${kindStr} · ${dateStr} · ${gpsStr}`;

    ctx.fillStyle = '#CE9F51';
    const fontSize = Math.max(11, Math.min(15, Math.round(barHeight * 0.42)));
    ctx.font = `600 ${fontSize}px "JetBrains Mono", monospace`;
    ctx.textBaseline = 'middle';
    ctx.fillText(stampText, 10, targetHeight - barHeight / 2);

    return outputCanvas;
  }

  function generateSimulatedFrame(targetCanvas, meta) {
    targetCanvas.width = 640;
    targetCanvas.height = 480;
    const ctx = targetCanvas.getContext('2d');

    const grad = ctx.createLinearGradient(0, 0, 640, 480);
    grad.addColorStop(0, '#1E293B');
    grad.addColorStop(1, '#0F172A');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, 640, 480);

    ctx.strokeStyle = '#334155';
    ctx.lineWidth = 2;
    ctx.strokeRect(30, 30, 580, 420);

    ctx.fillStyle = '#CE9F51';
    ctx.font = 'bold 24px "Cairo", sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('CIRA LIVE TELEMETRY CAMERA', 320, 100);

    ctx.fillStyle = '#F8FAFC';
    ctx.font = '18px monospace';
    const kindName = (meta.kind || 'PROOF').replace(/_/g, ' ').toUpperCase();
    ctx.fillText(`MANDATORY LIVE PROOF: ${kindName}`, 320, 160);

    ctx.strokeStyle = '#CE9F51';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(320, 260, 60, 0, Math.PI * 2);
    ctx.stroke();

    ctx.fillStyle = '#38BDF8';
    ctx.font = 'bold 20px monospace';
    ctx.fillText(`${meta.reading || 'VERIFIED'}`, 320, 266);

    ctx.fillStyle = '#94A3B8';
    ctx.font = '14px monospace';
    ctx.fillText(`Target: ${meta.booking_id || 'ACTIVE MISSION'}`, 320, 360);

    ctx.textAlign = 'left';
  }

  const Camera = {
    capture: function (options = {}) {
      return new Promise((resolve) => {
        const title = options.title || 'Live Camera Verification';
        const hint = options.hint || 'Position camera steadily and take a live photo';
        const bookingId = options.booking_id || options.bookingId || null;
        const kind = options.kind || 'odometer';
        const isDev = Boolean(window.location && window.location.search.includes('dev=1'));

        let activeStream = null;
        let capturedCanvas = null;

        const modalOverlay = document.createElement('div');
        modalOverlay.className = 'modal-overlay open';
        modalOverlay.style.zIndex = '9999';

        modalOverlay.innerHTML = `
          <div class="modal-box" style="max-width:560px; background:#0B132B; color:#FFFFFF;">
            <div class="modal-header" style="background:#1C2541; border-bottom:1px solid #3A506B;">
              <div>
                <h3 class="modal-title" style="color:#CE9F51; font-size:18px; margin:0;">${title}</h3>
                <div style="font-size:12px; color:#DCE4EF; margin-top:2px;">${hint}</div>
              </div>
              <button type="button" class="modal-close-btn" id="cam-btn-close" aria-label="Close">&times;</button>
            </div>
            <div class="modal-body" style="padding:16px; background:#0B132B; display:flex; flex-direction:column; align-items:center;">
              <div id="cam-error-box" style="display:none; width:100%; padding:12px; border-radius:6px; background:#450A0A; border:1px solid #DC2626; color:#FECACA; font-size:13px; margin-bottom:12px; text-align:center;">
                <strong>Camera required to continue.</strong>
                <div style="font-size:12px; margin-top:4px;">Live camera access is mandatory. Gallery and upload are prohibited.</div>
              </div>

              <div style="position:relative; width:100%; height:320px; background:#000; border-radius:8px; overflow:hidden; display:flex; align-items:center; justify-content:center; border:2px solid #1C2541;">
                <video id="cam-video-el" autoplay playsinline muted style="width:100%; height:100%; object-fit:cover;"></video>
                <canvas id="cam-preview-canvas" style="display:none; width:100%; height:100%; object-fit:contain;"></canvas>
                <div id="cam-crosshair" style="position:absolute; inset:0; pointer-events:none; border:2px dashed rgba(206,159,81,0.4); margin:20px; border-radius:6px; display:flex; align-items:center; justify-content:center;">
                  <span style="background:rgba(0,0,0,0.6); padding:4px 8px; border-radius:4px; font-size:11px; color:#CE9F51; letter-spacing:0.04em;">LIVE ALIGNMENT</span>
                </div>
              </div>

              <div id="cam-dev-fallback" style="display:none; margin-top:12px; width:100%;">
                <button type="button" id="cam-btn-sim-dev" class="btn btn-secondary btn-sm" style="width:100%; background:#1C2541; color:#CE9F51; border-color:#CE9F51;">
                  Generate Live Dev Snapshot (?dev=1 fallback)
                </button>
              </div>
            </div>

            <div class="modal-footer" style="background:#1C2541; border-top:1px solid #3A506B; display:flex; justify-content:space-between; align-items:center;">
              <button type="button" class="btn btn-secondary btn-sm" id="cam-btn-cancel" style="background:transparent; border-color:#3A506B; color:#CBD5E1;">Cancel</button>
              <div style="display:flex; gap:8px;">
                <button type="button" class="btn btn-secondary btn-sm" id="cam-btn-retake" style="display:none; background:#0B132B; color:#FFFFFF; border-color:#3A506B;">Retake</button>
                <button type="button" class="btn btn-gold btn-sm" id="cam-btn-take">Take photo</button>
                <button type="button" class="btn btn-success btn-sm" id="cam-btn-use" style="display:none; background:#10B981; border-color:#10B981; color:#FFFFFF; font-weight:700;">Use photo</button>
              </div>
            </div>
          </div>
        `;

        document.body.appendChild(modalOverlay);

        const videoEl = modalOverlay.querySelector('#cam-video-el');
        const canvasEl = modalOverlay.querySelector('#cam-preview-canvas');
        const crosshairEl = modalOverlay.querySelector('#cam-crosshair');
        const errorBox = modalOverlay.querySelector('#cam-error-box');
        const devFallbackBox = modalOverlay.querySelector('#cam-dev-fallback');
        const btnTake = modalOverlay.querySelector('#cam-btn-take');
        const btnRetake = modalOverlay.querySelector('#cam-btn-retake');
        const btnUse = modalOverlay.querySelector('#cam-btn-use');
        const btnClose = modalOverlay.querySelector('#cam-btn-close');
        const btnCancel = modalOverlay.querySelector('#cam-btn-cancel');
        const btnSimDev = modalOverlay.querySelector('#cam-btn-sim-dev');

        function cleanup() {
          if (activeStream) {
            activeStream.getTracks().forEach((track) => track.stop());
            activeStream = null;
          }
          if (modalOverlay.parentNode) {
            modalOverlay.parentNode.removeChild(modalOverlay);
          }
        }

        async function startCamera() {
          try {
            if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
              throw new Error('MediaDevices unavailable');
            }
            activeStream = await navigator.mediaDevices.getUserMedia({
              video: {
                facingMode: { ideal: 'environment' },
                width: { ideal: 1280 },
                height: { ideal: 720 }
              },
              audio: false
            });
            videoEl.srcObject = activeStream;
            await videoEl.play();
            errorBox.style.display = 'none';
          } catch (err) {
            errorBox.style.display = 'block';
            btnTake.disabled = true;
            btnTake.style.opacity = '0.5';
            if (isDev) {
              devFallbackBox.style.display = 'block';
            }
          }
        }

        function freezeFrame() {
          canvasEl.width = videoEl.videoWidth || 640;
          canvasEl.height = videoEl.videoHeight || 480;
          const ctx = canvasEl.getContext('2d');
          ctx.drawImage(videoEl, 0, 0, canvasEl.width, canvasEl.height);

          videoEl.style.display = 'none';
          canvasEl.style.display = 'block';
          crosshairEl.style.display = 'none';

          btnTake.style.display = 'none';
          btnRetake.style.display = 'inline-block';
          btnUse.style.display = 'inline-block';
          capturedCanvas = canvasEl;
        }

        function resumeCamera() {
          canvasEl.style.display = 'none';
          videoEl.style.display = 'block';
          crosshairEl.style.display = 'flex';

          btnTake.style.display = 'inline-block';
          btnRetake.style.display = 'none';
          btnUse.style.display = 'none';
          capturedCanvas = null;
        }

        btnTake.addEventListener('click', freezeFrame);

        btnRetake.addEventListener('click', resumeCamera);

        if (btnSimDev) {
          btnSimDev.addEventListener('click', () => {
            generateSimulatedFrame(canvasEl, {
              kind,
              booking_id: bookingId,
              reading: options.reading || 'LIVE CHECK'
            });
            videoEl.style.display = 'none';
            canvasEl.style.display = 'block';
            crosshairEl.style.display = 'none';
            btnTake.style.display = 'none';
            btnRetake.style.display = 'inline-block';
            btnUse.style.display = 'inline-block';
            capturedCanvas = canvasEl;
          });
        }

        btnUse.addEventListener('click', async () => {
          if (!capturedCanvas) return;
          btnUse.disabled = true;
          btnUse.textContent = 'Saving...';

          const gps = await getCurrentGps();
          const currentUser = typeof Auth !== 'undefined' ? Auth.getCurrentUser() : null;

          const meta = {
            booking_id: bookingId,
            kind: kind,
            taken_at: new Date().toISOString(),
            lat: gps.lat,
            lng: gps.lng,
            by_user_id: currentUser ? currentUser.id : 'USR-DRV-101'
          };

          const stampedCanvas = resizeAndStampCanvas(capturedCanvas, meta, 800);

          stampedCanvas.toBlob(
            async (blob) => {
              try {
                const photoId = await Media.save(blob, meta);
                cleanup();
                resolve(photoId);
              } catch (err) {
                cleanup();
                resolve(null);
              }
            },
            'image/jpeg',
            0.6
          );
        });

        btnClose.addEventListener('click', () => {
          cleanup();
          resolve(null);
        });

        btnCancel.addEventListener('click', () => {
          cleanup();
          resolve(null);
        });

        startCamera();
      });
    }
  };

  global.Camera = Camera;
})(typeof window !== 'undefined' ? window : this);
