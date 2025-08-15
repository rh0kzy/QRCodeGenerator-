(() => {
  const $ = (sel) => document.querySelector(sel);
  const form = $('#qrForm');
  const urlInput = $('#urlInput');
  const sizeRange = $('#sizeRange');
  const sizeNumber = $('#sizeNumber');
  const fgColor = $('#fgColor');
  const bgToggle = $('#bgToggle');
  const bgColor = $('#bgColor');
  const message = $('#message');
  const qrcodeEl = $('#qrcode');
  const downloadBtn = $('#downloadBtn');
  const clearBtn = $('#clearBtn');

  let qrInstance = null;

  // Sync range <-> number inputs
  const clampSize = (v) => Math.max(64, Math.min(2048, Number(v) || 256));
  function syncFromRange() { sizeNumber.value = sizeRange.value; }
  function syncFromNumber() {
    const v = clampSize(sizeNumber.value);
    sizeNumber.value = v;
    sizeRange.value = Math.max(128, Math.min(1024, v));
  }
  sizeRange.addEventListener('input', syncFromRange);
  sizeNumber.addEventListener('input', syncFromNumber);

  // Toggle background picker
  bgToggle.addEventListener('change', () => {
    bgColor.disabled = !bgToggle.checked;
  });

  // Helpers
  function setMessage(text, isError = false) {
    message.textContent = text || '';
    message.style.color = isError ? '#ff9aa2' : 'var(--muted)';
  }
  function normalizeUrl(str) {
    const s = str.trim();
    if (!s) return '';
    // If user omitted scheme, assume https://
    const maybe = /^(https?:)?\/\//i.test(s) ? s : `https://${s}`;
    return maybe;
  }
  function validUrl(str) {
    try {
      const u = new URL(str);
      return !!u.protocol && !!u.hostname;
    } catch {
      return false;
    }
  }
  function clearPreview() {
    qrcodeEl.innerHTML = '';
    downloadBtn.setAttribute('aria-disabled', 'true');
    downloadBtn.removeAttribute('href');
  }

  function ensureLib() {
    if (typeof window.QRCode === 'undefined') {
      setMessage('QR library not loaded. Check your internet connection and try again.', true);
      return false;
    }
    return true;
  }

  function generate() {
    const normalized = normalizeUrl(urlInput.value);
    if (!normalized || !validUrl(normalized)) {
      setMessage('Please enter a valid website URL (e.g., https://example.com).', true);
      clearPreview();
      return false;
    }

    if (!ensureLib()) return false;

    const size = clampSize(sizeNumber.value);
    const colorDark = fgColor.value || '#000000';
    const useBg = bgToggle.checked;
    const colorLight = useBg ? (bgColor.value || '#ffffff') : 'rgba(0,0,0,0)';

    // Clear existing and build new
    clearPreview();

    try {
      qrInstance = new QRCode(qrcodeEl, {
        text: normalized,
        width: size,
        height: size,
        colorDark,
        colorLight,
        correctLevel: QRCode.CorrectLevel.H,
      });
    } catch (e) {
      setMessage('Failed to render QR code. Try a different size.', true);
      return false;
    }

    // Wait a tick for canvas/image to be present
    setTimeout(() => {
      const canvas = qrcodeEl.querySelector('canvas');
      const img = qrcodeEl.querySelector('img');
      const sourceEl = canvas || img; // library may switch to img
      if (!sourceEl) {
        setMessage('Failed to render QR code. Try a different size.', true);
        return;
      }
      try {
        const dataUrl = canvas ? canvas.toDataURL('image/png') : img.src;
        downloadBtn.href = dataUrl;
        downloadBtn.setAttribute('aria-disabled', 'false');
        setMessage('QR code ready. You can download the PNG.');
      } catch (e) {
        setMessage('Rendered, but could not prepare download.', true);
      }
    }, 50);

    return true;
  }

  form.addEventListener('submit', (e) => {
    e.preventDefault();
    generate();
  });

  clearBtn.addEventListener('click', () => {
    urlInput.value = '';
    setMessage('');
    clearPreview();
  });

  // Auto-generate if URL is prefilled
  if (urlInput.value) {
    generate();
  }
})();
