/** YYYY-MM-DD in the device's local time zone (not UTC). */
export const localDateStamp = (d = new Date()) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
/** Share a generated file via the Web Share API, with fallbacks. Returns a user-facing status or null (cancelled). */
export function download(file: File) {
  const u = URL.createObjectURL(file), a = document.createElement('a'); a.href = u; a.download = file.name; document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(u), 10000);
}
export async function shareFile(file: File, title: string, text: string): Promise<{ ok: boolean; text: string } | null> {
  const url = location.origin + location.pathname;
  try {
    if (navigator.canShare?.({ files: [file] }) && navigator.share) { await navigator.share({ files: [file], title, text }); return { ok: true, text: 'Shared.' }; }
    if (navigator.share) { download(file); await navigator.share({ title, text: text + '\n' + url, url }); return { ok: true, text: `This browser can't share files, so ${file.name} was downloaded and the summary was shared.` }; }
  } catch (e) {
    if ((e as DOMException)?.name === 'AbortError') return null; // user cancelled: stay quiet
    download(file); return { ok: false, text: `Sharing failed (${(e as Error).message}). ${file.name} was downloaded instead.` };
  }
  download(file);
  try { await navigator.clipboard.writeText(text + '\n' + url); return { ok: true, text: `Sharing isn't supported here. ${file.name} was downloaded, and the summary and link were copied to the clipboard.` }; }
  catch { return { ok: true, text: `Sharing isn't supported here. ${file.name} was downloaded.` }; }
}
