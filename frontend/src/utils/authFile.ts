/**
 * Authenticated file viewing & downloading helpers.
 * Never appends the long-lived JWT to URLs; uses fetch() (with the Authorization
 * header injected via window.fetch wrapper) + URL.createObjectURL().
 */

function parseErrorMessage(text: string, status: number): string {
  try {
    const parsed = JSON.parse(text);
    if (parsed && typeof parsed.error === 'string') return parsed.error;
  } catch {
    // ignore non-JSON body
  }
  return `HTTP ${status}`;
}

export async function fetchAuthenticatedBlobUrl(url: string, signal?: AbortSignal): Promise<string> {
  const res = await fetch(url, { signal });
  if (!res.ok) {
    const txt = await res.text();
    throw new Error(parseErrorMessage(txt, res.status));
  }
  const blob = await res.blob();
  return URL.createObjectURL(blob);
}

export async function openAuthenticatedFileInNewTab(url: string): Promise<void> {
  const popup = window.open('', '_blank');
  try {
    const res = await fetch(url);
    if (!res.ok) {
      const txt = await res.text();
      throw new Error(parseErrorMessage(txt, res.status));
    }
    const blob = await res.blob();
    const blobUrl = URL.createObjectURL(blob);
    if (popup) {
      popup.location.href = blobUrl;
    } else {
      window.open(blobUrl, '_blank');
    }
    setTimeout(() => URL.revokeObjectURL(blobUrl), 5 * 60 * 1000);
  } catch (err) {
    if (popup && !popup.closed) {
      popup.close();
    }
    throw err;
  }
}

export async function downloadAuthenticatedFile(url: string, fallbackFilename: string): Promise<void> {
  const res = await fetch(url);
  if (!res.ok) {
    const txt = await res.text();
    throw new Error(parseErrorMessage(txt, res.status));
  }

  let filename = fallbackFilename;
  const cd = res.headers.get('Content-Disposition') || '';
  const utfMatch = cd.match(/filename\*=UTF-8''([^;\s]+)/i);
  const plainMatch = cd.match(/filename="?([^";\n]+)"?/i);
  if (utfMatch && utfMatch[1]) {
    try {
      filename = decodeURIComponent(utfMatch[1]);
    } catch {
      filename = utfMatch[1];
    }
  } else if (plainMatch && plainMatch[1]) {
    filename = plainMatch[1].trim();
  }

  const blob = await res.blob();
  const blobUrl = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = blobUrl;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(blobUrl), 10 * 1000);
}
