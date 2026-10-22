import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { downloadDocument, getDocument, reportDocument } from '../services/api.js';

function formatBytes(bytes) {
  if (!Number.isFinite(bytes)) return 'Unknown';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export default function DocumentDetails() {
  const { id } = useParams();
  const [document, setDocument] = useState(null);
  const [error, setError] = useState('');
  const [downloading, setDownloading] = useState(false);
  const [reporting, setReporting] = useState(false);
  const [reportError, setReportError] = useState('');
  const [reportMessage, setReportMessage] = useState('');

  useEffect(() => {
    setDocument(null);
    setError('');
    getDocument(id).then((result) => setDocument(result.document)).catch((err) => setError(err.message));
  }, [id]);

  async function onDownload() {
    setDownloading(true);
    setError('');
    try {
      const { download } = await downloadDocument(id);
      window.location.assign(download.url);
    } catch (err) {
      setError(err.message);
    } finally {
      setDownloading(false);
    }
  }

  async function onReport(event) {
    event.preventDefault();
    setReporting(true);
    setReportError('');
    try {
      const form = new FormData(event.currentTarget);
      await reportDocument(id, { reason: form.get('reason'), details: form.get('details') });
      setReportMessage('Thank you. Your report was submitted for review.');
      event.currentTarget.reset();
    } catch (err) {
      setReportError(err.message);
    } finally {
      setReporting(false);
    }
  }

  if (error && !document) return <p role="alert" className="rounded-lg bg-red-50 p-3 text-red-700">{error}</p>;
  if (!document) return <p role="status" className="text-slate-600">Loading document…</p>;

  return (
    <article className="mx-auto max-w-3xl rounded-xl border border-slate-200 bg-white p-6">
      <Link to="/search" className="text-sm text-indigo-700 hover:underline">Back to search</Link>
      <div className="mt-4 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">{document.title}</h1>
          <p className="mt-2 text-slate-600">{document.subject}{document.topic ? ` · ${document.topic}` : ''} · {document.fileExtension.toUpperCase()}</p>
        </div>
        {document.status === 'approved' && <button type="button" onClick={onDownload} disabled={downloading} className="rounded-lg bg-indigo-600 px-4 py-2 font-medium text-white hover:bg-indigo-700 disabled:opacity-50">{downloading ? 'Preparing…' : 'Download'}</button>}
      </div>
      {error && <p role="alert" className="mt-4 rounded-lg bg-red-50 p-3 text-red-700">{error}</p>}
      {document.status !== 'approved' && <p className="mt-4 rounded-lg bg-amber-50 p-3 text-amber-800">This document is {document.status} and is not available for download.</p>}
      <p className="mt-5 text-slate-700">{document.description || 'No description provided.'}</p>
      <dl className="mt-6 grid grid-cols-[auto_1fr] gap-x-6 gap-y-2 text-sm">
        <dt className="text-slate-500">Field / Discipline</dt><dd>{document.fieldDiscipline || 'Not provided'}</dd>
        <dt className="text-slate-500">Course / Program</dt><dd>{document.courseProgram || 'Not provided'}</dd>
        <dt className="text-slate-500">Semester / Study year</dt><dd>{document.semesterStudyYear || 'Not provided'}</dd>
        <dt className="text-slate-500">Document type</dt><dd>{document.documentType || 'Not provided'}</dd>
        <dt className="text-slate-500">Academic year</dt><dd>{document.academicYear || 'Not provided'}</dd>
        <dt className="text-slate-500">College / University</dt><dd>{document.collegeUniversity || 'Not provided'}</dd>
        <dt className="text-slate-500">Uploaded by</dt><dd>{document.uploaderName || 'Student'}</dd>
        <dt className="text-slate-500">Original filename</dt><dd>{document.originalFilename}</dd>
        <dt className="text-slate-500">Uploaded</dt><dd>{new Date(document.createdAt).toLocaleDateString()}</dd>
        <dt className="text-slate-500">File type</dt><dd>{document.mimeType}</dd>
        <dt className="text-slate-500">File size</dt><dd>{formatBytes(document.fileSize)}</dd>
        <dt className="text-slate-500">Downloads</dt><dd>{document.downloadCount}</dd>
      </dl>
      {document.topic && <p className="mt-5 text-sm text-slate-600"><strong>Topic:</strong> {document.topic}{document.subtopic ? ` · ${document.subtopic}` : ''}</p>}
      {document.tags?.length > 0 && <p className="mt-3 text-sm text-slate-500">{document.tags.join(' · ')}</p>}
      {document.status === 'approved' && (
        <details className="mt-8 border-t border-slate-200 pt-5">
          <summary className="cursor-pointer font-medium text-slate-700">Report document</summary>
          <form onSubmit={onReport} className="mt-4 space-y-3">
            <select name="reason" required aria-label="Report reason" className="rounded-lg border border-slate-300 p-2">
              <option value="inappropriate">Inappropriate</option><option value="copyright">Copyright</option><option value="spam">Spam</option><option value="wrong_content">Wrong content</option><option value="other">Other</option>
            </select>
            <textarea name="details" maxLength="1000" placeholder="Optional details" className="block w-full rounded-lg border border-slate-300 p-2" />
            <button type="submit" disabled={reporting} className="rounded-lg border border-slate-300 px-3 py-2 text-sm disabled:opacity-50">{reporting ? 'Submitting…' : 'Submit report'}</button>
            {reportError && <p role="alert" className="text-sm text-red-700">{reportError}</p>}
            {reportMessage && <p className="text-sm text-emerald-700">{reportMessage}</p>}
          </form>
        </details>
      )}
    </article>
  );
}
