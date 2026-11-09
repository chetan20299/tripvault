import { Capacitor } from '@capacitor/core';
import { blobToBase64 } from './util';

export function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = Object.assign(document.createElement('a'), { href: url, download: filename });
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

/** Native share sheet: Capacitor on Android/iOS, Web Share API in browsers. Returns false if unsupported. */
export async function shareFile(blob: Blob, filename: string, title: string): Promise<boolean> {
  if (Capacitor.isNativePlatform()) {
    const [{ Filesystem, Directory }, { Share }] = await Promise.all([import('@capacitor/filesystem'), import('@capacitor/share')]);
    const { uri } = await Filesystem.writeFile({ path: filename, data: await blobToBase64(blob), directory: Directory.Cache });
    await Share.share({ title, files: [uri] });
    return true;
  }
  const file = new File([blob], filename, { type: blob.type });
  if (navigator.canShare?.({ files: [file] })) {
    try { await navigator.share({ files: [file], title }); } catch (e: any) { if (e?.name !== 'AbortError') throw e; }
    return true;
  }
  return false;
}

/** Saves the file: download in browsers, Documents folder on native. */
export async function saveFile(blob: Blob, filename: string): Promise<string> {
  if (Capacitor.isNativePlatform()) {
    const { Filesystem, Directory } = await import('@capacitor/filesystem');
    await Filesystem.writeFile({ path: filename, data: await blobToBase64(blob), directory: Directory.Documents });
    return `Saved to Documents/${filename}`;
  }
  downloadBlob(blob, filename);
  return 'Download started';
}
