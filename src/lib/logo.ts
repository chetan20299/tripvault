export const LOGO_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#167A9C"/><stop offset="1" stop-color="#06293A"/></linearGradient></defs><rect width="512" height="512" rx="112" fill="url(#g)"/><path d="M256 432C256 432 138 304 138 222a118 118 0 1 1 236 0c0 82-118 210-118 210z" fill="#fff"/><circle cx="256" cy="222" r="74" fill="none" stroke="#F59E0B" stroke-width="10" stroke-dasharray="16 11"/><circle cx="256" cy="206" r="28" fill="#0B4F6C"/><path d="M242 222h28l-6 58h-16z" fill="#0B4F6C"/></svg>`;

export const LOGO_DATA_URL = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(LOGO_SVG)}`;

/** Rasterises the logo (jsPDF can't draw SVG). */
export function logoPng(size = 512): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const c = document.createElement('canvas');
      c.width = c.height = size;
      c.getContext('2d')!.drawImage(img, 0, 0, size, size);
      resolve(c.toDataURL('image/png'));
    };
    img.onerror = reject;
    img.src = LOGO_DATA_URL;
  });
}
