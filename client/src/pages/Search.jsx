import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { FileText, Loader2 } from 'lucide-react';
import { getMetadataOptions, searchDocuments } from '../services/api.js';

function DocumentCard({ document }) {
  return (
    <article className="rounded-xl border border-slate-200 bg-white p-5">
      <div className="flex items-start gap-3">
        <FileText className="mt-1 h-5 w-5 shrink-0 text-indigo-600" aria-hidden="true" />
        <div className="min-w-0 flex-1">
          <Link to={`/documents/${document.id}`} className="font-semibold text-indigo-700 hover:underline">{document.title}</Link>
          <p className="mt-1 text-sm text-slate-600">{document.subject}{document.topic ? ` · ${document.topic}` : ''}{document.documentType ? ` · ${document.documentType}` : ''} · {document.fileExtension.toUpperCase()}</p>
          <p className="mt-1 text-xs text-slate-500">{[document.fieldDiscipline, document.courseProgram, document.semesterStudyYear, document.academicYear, document.collegeUniversity].filter(Boolean).join(' · ')}</p>
          <p className="mt-2 text-sm text-slate-700">{document.description || 'No description provided.'}</p>
          <p className="mt-2 text-xs text-slate-500">Uploaded by {document.uploaderName || 'student'} · {document.downloadCount} downloads</p>
          {document.tags?.length > 0 && <p className="mt-2 text-xs text-slate-500">{document.tags.join(' · ')}</p>}
        </div>
      </div>
    </article>
  );
}

export default function Search() {
  const [params, setParams] = useSearchParams();
  const q = params.get('q') || '';
  const [results, setResults] = useState({ documents: [], pagination: { page: 1, totalPages: 0, total: 0 } });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [options, setOptions] = useState({});
  const [filters, setFilters] = useState({
    subject: params.get('subject') || '', topic: params.get('topic') || '',
    fieldDiscipline: params.get('fieldDiscipline') || '', courseProgram: params.get('courseProgram') || '',
    semesterStudyYear: params.get('semesterStudyYear') || '', documentType: params.get('documentType') || '',
    academicYear: params.get('academicYear') || '', collegeUniversity: params.get('collegeUniversity') || '',
    tagsKeyword: params.get('tagsKeyword') || '',
    fileType: params.get('fileType') || '', from: params.get('from') || '', to: params.get('to') || '',
    sort: params.get('sort') || 'relevance',
  });

  useEffect(() => {
    getMetadataOptions().then((result) => setOptions((result.options || []).reduce((grouped, option) => ({ ...grouped, [option.fieldKey]: [...(grouped[option.fieldKey] || []), option] }), {}))).catch(() => {});
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError('');
    searchDocuments({ q, ...filters, page: params.get('page') || 1 }, { signal: controller.signal })
      .then(setResults)
      .catch((err) => { if (err.name !== 'AbortError') setError(err.message); })
      .finally(() => setLoading(false));
    return () => controller.abort();
  }, [q, params, filters]);

  function applyFilters(event) {
    event.preventDefault();
    const next = new URLSearchParams({ ...(q ? { q } : {}), ...Object.fromEntries(Object.entries(filters).filter(([, value]) => value)) });
    setParams(next);
  }

  function changePage(page) {
    const next = new URLSearchParams(params);
    next.set('page', page);
    setParams(next);
  }

  return (
    <div className="mx-auto max-w-5xl">
      <h1 className="text-2xl font-bold text-slate-900">Search documents</h1>
      <form onSubmit={applyFilters} className="mt-5 grid gap-3 rounded-xl border border-slate-200 bg-white p-4 sm:grid-cols-2 lg:grid-cols-4">
        {['fieldDiscipline', 'courseProgram', 'semesterStudyYear', 'documentType', 'academicYear', 'collegeUniversity'].map((field) => <select key={field} aria-label={`${field} filter`} className="rounded-lg border border-slate-300 p-2" value={filters[field]} onChange={(e) => setFilters({ ...filters, [field]: e.target.value })}><option value="">All {field.replace(/[A-Z]/g, (letter) => ` ${letter.toLowerCase()}`)}</option>{(options[{ fieldDiscipline: 'field_discipline', courseProgram: 'course_program', semesterStudyYear: 'semester_study_year', documentType: 'document_type', academicYear: 'academic_year', collegeUniversity: 'college_university' }[field]] || []).map((option) => <option key={option.id} value={option.value}>{option.label}</option>)}</select>)}
        <input aria-label="Subject filter" placeholder="Subject" className="rounded-lg border border-slate-300 p-2" value={filters.subject} onChange={(e) => setFilters({ ...filters, subject: e.target.value })} />
        <input aria-label="Topic filter" placeholder="Topic" className="rounded-lg border border-slate-300 p-2" value={filters.topic} onChange={(e) => setFilters({ ...filters, topic: e.target.value })} />
        <input aria-label="Tags keyword filter" placeholder="Tag or keyword" className="rounded-lg border border-slate-300 p-2" value={filters.tagsKeyword} onChange={(e) => setFilters({ ...filters, tagsKeyword: e.target.value })} />
        <select aria-label="File type filter" className="rounded-lg border border-slate-300 p-2" value={filters.fileType} onChange={(e) => setFilters({ ...filters, fileType: e.target.value })}><option value="">All file types</option><option value="ppt">PPT</option><option value="pptx">PPTX</option><option value="doc">DOC</option><option value="docx">DOCX</option></select>
        <select aria-label="Sort results" className="rounded-lg border border-slate-300 p-2" value={filters.sort} onChange={(e) => setFilters({ ...filters, sort: e.target.value })}><option value="relevance">Relevance</option><option value="newest">Newest</option><option value="downloads">Most downloaded</option></select>
        <label className="text-sm text-slate-600">From<input type="date" className="mt-1 block w-full rounded-lg border border-slate-300 p-2" value={filters.from} onChange={(e) => setFilters({ ...filters, from: e.target.value })} /></label>
        <label className="text-sm text-slate-600">To<input type="date" className="mt-1 block w-full rounded-lg border border-slate-300 p-2" value={filters.to} onChange={(e) => setFilters({ ...filters, to: e.target.value })} /></label>
        <button type="submit" className="self-end rounded-lg bg-indigo-600 px-4 py-2 font-medium text-white hover:bg-indigo-700">Apply filters</button>
      </form>
      {loading && <div className="flex justify-center py-12" role="status"><Loader2 className="h-6 w-6 animate-spin text-indigo-600" aria-label="Loading search results" /></div>}
      {error && <p role="alert" className="mt-6 rounded-lg bg-red-50 p-3 text-red-700">{error}</p>}
      {!loading && !error && <><p className="mt-6 text-sm text-slate-500">{results.pagination.total} result{results.pagination.total === 1 ? '' : 's'}{q ? ` for “${q}”` : ''}</p><div className="mt-3 space-y-3">{results.documents.map((document) => <DocumentCard key={document.id} document={document} />)}</div>{results.documents.length === 0 && <p className="mt-8 rounded-xl border border-dashed border-slate-300 p-10 text-center text-slate-500">No approved documents matched your search. Try a broader term or remove a filter.</p>}{results.pagination.totalPages > 1 && <div className="mt-6 flex justify-center gap-3"><button type="button" disabled={results.pagination.page <= 1} onClick={() => changePage(results.pagination.page - 1)} className="rounded-lg border px-3 py-2 disabled:opacity-50">Previous</button><span className="px-2 py-2 text-sm text-slate-600">Page {results.pagination.page} of {results.pagination.totalPages}</span><button type="button" disabled={results.pagination.page >= results.pagination.totalPages} onClick={() => changePage(results.pagination.page + 1)} className="rounded-lg border px-3 py-2 disabled:opacity-50">Next</button></div>}</>}
    </div>
  );
}
