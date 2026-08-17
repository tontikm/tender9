"use client";

import { useState } from "react";
import type { TenderDocument } from "@/lib/tender-docs";

export function TenderDocuments({
  tenderId,
  documents,
  savedDocIndexes = [],
  signedIn = true,
}: {
  tenderId: string;
  documents: TenderDocument[];
  savedDocIndexes?: number[];
  signedIn?: boolean;
}) {
  const [openIndex, setOpenIndex] = useState<number | null>(null);
  const saved = new Set(savedDocIndexes);

  return (
    <ul className="document-list">
      {documents.map((doc) => {
        const isOpen = openIndex === doc.index;
        return (
          <li key={doc.index} className="document-item">
            <div className="document-row">
              <span className="document-name">{doc.name}</span>
              <span className="document-actions">
                {doc.isPdf && signedIn && (
                  <a
                    href={`/fill?tender=${tenderId}&doc=${doc.index}`}
                    className={`document-preview-btn ${saved.has(doc.index) ? "resume" : ""}`}
                  >
                    {saved.has(doc.index) ? "Resume fill" : "Fill"}
                  </a>
                )}
                {doc.isPdf && !signedIn && (
                  <a href="/signup" className="document-preview-btn">
                    Sign up to fill
                  </a>
                )}
                {doc.isPdf && (
                  <button
                    type="button"
                    className="document-preview-btn"
                    onClick={() => setOpenIndex(isOpen ? null : doc.index)}
                  >
                    {isOpen ? "Hide preview" : "Preview"}
                  </button>
                )}
                <a href={doc.url} target="_blank" rel="noreferrer" className="document-download">
                  Download
                </a>
              </span>
            </div>

            {doc.isPdf && isOpen && (
              <div className="document-viewer">
                <iframe
                  src={`/tenders/${tenderId}/document?i=${doc.index}`}
                  title={`Preview of ${doc.name}`}
                />
              </div>
            )}
          </li>
        );
      })}
    </ul>
  );
}
