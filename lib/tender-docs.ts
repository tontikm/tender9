// Turns raw eTenders document download URLs into something displayable.
// The URLs look like:
//   https://www.etenders.gov.za/home/Download?blobName=<guid>.pdf&downloadedFileName=<name>.pdf
// so the human filename lives in the `downloadedFileName` query parameter.

export interface TenderDocument {
  index: number;
  url: string; // original eTenders URL, used for direct download
  name: string; // friendly filename
  isPdf: boolean; // only PDFs can be previewed inline
}

export function describeDocuments(urls: string[] | null | undefined): TenderDocument[] {
  return (urls ?? []).map((url, index) => {
    let name = `Document ${index + 1}`;
    let fileHint = url;

    try {
      const parsed = new URL(url);
      const downloaded = parsed.searchParams.get("downloadedFileName");
      const blob = parsed.searchParams.get("blobName");
      if (downloaded) name = downloaded; // already decoded by URLSearchParams
      fileHint = downloaded || blob || url;
    } catch {
      // Not a parseable URL — fall back to defaults.
    }

    return { index, url, name, isPdf: /\.pdf$/i.test(fileHint) };
  });
}
