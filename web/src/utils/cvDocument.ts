export const CV_DOCUMENT_MIME_TYPES = [
  "application/pdf",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.oasis.opendocument.text",
  "application/rtf",
  "text/rtf",
  "text/plain",
  "text/markdown",
];

export const CV_DOCUMENT_ERROR = "Upload a CV or resume document (PDF, DOC, DOCX, ODT, RTF, TXT, or MD). Images and videos are not allowed.";

const MIME_BY_EXTENSION: Record<string, string> = {
  pdf: "application/pdf", doc: "application/msword",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  odt: "application/vnd.oasis.opendocument.text", rtf: "application/rtf",
  txt: "text/plain", md: "text/markdown",
};

export function assertCvDocument(file: { name?: string | null; mimeType?: string | null; type?: string | null }) {
  const extension = String(file?.name || "").split(".").pop()?.toLowerCase() || "";
  const expected = MIME_BY_EXTENSION[extension];
  const mime = String(file?.mimeType || file?.type || "").split(";")[0].trim().toLowerCase();
  if (!expected || (mime && mime !== "application/octet-stream" && mime !== expected &&
    !(extension === "rtf" && mime === "text/rtf") && !(extension === "md" && mime === "text/plain"))) {
    throw new Error(CV_DOCUMENT_ERROR);
  }
  return expected;
}

export function assertCvDocumentContent(name: string, bytes: Uint8Array) {
  assertCvDocument({ name });
  const extension = name.split(".").pop()?.toLowerCase();
  const starts = (signature: number[]) => signature.every((value, index) => bytes[index] === value);
  const text = ["rtf", "txt", "md"].includes(extension || "")
    ? new TextDecoder().decode(bytes, { stream: true }) : "";
  const valid = extension === "pdf" ? starts([0x25, 0x50, 0x44, 0x46, 0x2d])
    : extension === "doc" ? starts([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1])
    : extension === "docx" || extension === "odt" ? starts([0x50, 0x4b, 0x03, 0x04])
    : extension === "rtf" ? text.trimStart().startsWith("{\\rtf")
    : bytes.length > 0 && !/[\u0000-\u0008\u000b\u000e-\u001f\ufffd]/.test(text);
  if (!valid) throw new Error(CV_DOCUMENT_ERROR);
}
