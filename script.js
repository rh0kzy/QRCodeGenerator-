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
  const logoInput = $('#logoInput');
  const logoSizeRange = $('#logoSizeRange');
  const logoSizeText = $('#logoSizeText');
  const logoGapRange = $('#logoGapRange');
  const logoGapText = $('#logoGapText');
  const qrcodeEl = $('#qrcode');
  const downloadBtn = $('#downloadBtn');
  const downloadPdfBtn = $('#downloadPdfBtn');
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
  
  if (logoSizeRange && logoSizeText) {
    logoSizeRange.addEventListener('input', () => {
      logoSizeText.textContent = logoSizeRange.value + '%';
    });
  }

  if (logoGapRange && logoGapText) {
    logoGapRange.addEventListener('input', () => {
      logoGapText.textContent = logoGapRange.value + '%';
    });
  }

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
    downloadPdfBtn.setAttribute('aria-disabled', 'true');
  }

  function ensureLib() {
    if (typeof window.QRCode === 'undefined') {
      setMessage('QR library not loaded. Check your internet connection and try again.', true);
      return false;
    }
    return true;
  }

  function generatePdf() {
    const canvas = qrcodeEl.querySelector('canvas');
    const img = qrcodeEl.querySelector('img');
    const sourceEl = canvas || img;

    if (!sourceEl || (downloadBtn.getAttribute('aria-disabled') === 'true')) {
      return;
    }

    try {
      const { jsPDF } = window.jspdf;
      const pdf = new jsPDF();
      const dataUrl = canvas ? canvas.toDataURL('image/png') : img.src;
      
      // QR Code size in the PDF (e.g., 100mm x 100mm)
      const pdfSize = 100;
      const x = (pdf.internal.pageSize.getWidth() - pdfSize) / 2;
      const y = (pdf.internal.pageSize.getHeight() - pdfSize) / 2;

      pdf.addImage(dataUrl, 'PNG', x, y, pdfSize, pdfSize);
      pdf.save("qrcode.pdf");
    } catch (e) {
      setMessage('Failed to generate PDF.', true);
    }
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
    setTimeout(async () => {
      const canvas = qrcodeEl.querySelector('canvas');
      const img = qrcodeEl.querySelector('img');
      const sourceEl = canvas || img; // library may switch to img
      if (!sourceEl) {
        setMessage('Failed to render QR code. Try a different size.', true);
        return;
      }
      try {
        if (img && !img.complete) {
          await new Promise((resolve, reject) => {
            img.onload = resolve;
            img.onerror = reject;
          });
        }

        // Composite on a larger internal canvas for crisp logo details.
        const maxOutputSize = 4096;
        const qualityScale = Math.min(4, Math.max(2, Math.floor(maxOutputSize / size)));
        const outputSize = size * qualityScale;
        const outputCanvas = document.createElement('canvas');
        outputCanvas.width = outputSize;
        outputCanvas.height = outputSize;
        const outCtx = outputCanvas.getContext('2d');

        // Keep QR modules sharp while scaling up.
        outCtx.imageSmoothingEnabled = false;
        outCtx.drawImage(sourceEl, 0, 0, outputSize, outputSize);

        const logoFile = logoInput.files[0];
        if (logoFile) {
          const logoImg = new Image();
          const logoUrl = URL.createObjectURL(logoFile);
          logoImg.src = logoUrl;
          await new Promise((resolve, reject) => {
            logoImg.onload = resolve;
            logoImg.onerror = reject;
          });

          const pct = logoSizeRange ? Number(logoSizeRange.value) : 22;
          const logoSize = outputSize * (pct / 100);
          const cx = outputSize / 2;
          const cy = outputSize / 2;
          const logoRadius = logoSize / 2;

          // Border/Gap calculation: based on a percentage of the logo size itself
          const gapPct = logoGapRange ? Number(logoGapRange.value) : 30;
          const clearGap = (logoSize * (gapPct / 100)) / 2;

          // 1) Punch a transparent circular hole so the space behind the logo stays empty.
          outCtx.save();
          outCtx.globalCompositeOperation = 'destination-out';
          outCtx.beginPath();
          outCtx.arc(cx, cy, logoRadius + clearGap, 0, Math.PI * 2);
          outCtx.fill();
          outCtx.restore();

          // 2) Draw the logo as a centered square crop to keep it clear and not stretched.
          const srcW = logoImg.naturalWidth || logoImg.width;
          const srcH = logoImg.naturalHeight || logoImg.height;
          const srcSize = Math.min(srcW, srcH);
          const sx = (srcW - srcSize) / 2;
          const sy = (srcH - srcSize) / 2;

          outCtx.save();
          outCtx.beginPath();
          outCtx.arc(cx, cy, logoRadius, 0, Math.PI * 2);
          outCtx.clip();
          outCtx.imageSmoothingEnabled = true;
          outCtx.imageSmoothingQuality = 'high';
          outCtx.drawImage(
            logoImg,
            sx,
            sy,
            srcSize,
            srcSize,
            cx - logoRadius,
            cy - logoRadius,
            logoSize,
            logoSize,
          );
          outCtx.restore();

          URL.revokeObjectURL(logoUrl);
        }

        const dataUrl = outputCanvas.toDataURL('image/png');
        downloadBtn.href = dataUrl;
        downloadBtn.setAttribute('aria-disabled', 'false');
        downloadPdfBtn.setAttribute('aria-disabled', 'false');

        // Show at user-selected visual size while keeping high-res internal pixels.
        const previewImg = document.createElement('img');
        previewImg.src = dataUrl;
        previewImg.alt = 'QR Code preview';
        previewImg.style.width = `${size}px`;
        previewImg.style.maxWidth = '100%';
        previewImg.style.height = 'auto';
        qrcodeEl.innerHTML = '';
        qrcodeEl.appendChild(previewImg);

        setMessage('QR code ready. You can download the PNG or PDF.');
      } catch (e) {
        setMessage('Rendered, but could not prepare download.', true);
      }
    }, 100);

    return true;
  }

  form.addEventListener('submit', (e) => {
    e.preventDefault();
    generate();
  });

  downloadPdfBtn.addEventListener('click', generatePdf);

  clearBtn.addEventListener('click', () => {
    urlInput.value = '';
    logoInput.value = '';
    if (logoSizeRange) {
      logoSizeRange.value = 22;
      logoSizeText.textContent = '22%';
    }
    if (logoGapRange) {
      logoGapRange.value = 30;
      logoGapText.textContent = '30%';
    }
    setMessage('');
    clearPreview();
  });

  // Auto-generate if URL is prefilled
  if (urlInput.value) {
    generate();
  }
})();
