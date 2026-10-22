import { useEffect, useState } from 'react';
import { FileText, Trash2, UploadCloud } from 'lucide-react';
import { useToast } from '../components/Toast.jsx';
import { apiUpload, deleteDocument, getMetadataOptions, getMyUploads, updateDocument } from '../services/api.js';

function formatSize(bytes) {
  return `${(bytes / 1024 / 1024).toFixed(2)} MB`;
}

const initialFields = { title: '', subject: '', topic: '', subtopic: '', description: '', tags: '', field_discipline: '', course_program: '', semester_study_year: '', document_type: '', academic_year: '', college_university: '' };

function MetadataControl({ label, name, value, onChange, options, required = false, maxLength = 200, disabled = false }) {
  return <label className="text-sm font-medium">{label}{required && <span className="text-red-600"> *</span>}
    {options?.length ? <select required={required} aria-label={label} className="mt-1 block w-full rounded-lg border border-slate-300 p-2" value={value} onChange={(e) => onChange(name, e.target.value)} disabled={disabled}><option value="">Select {label.toLowerCase()}</option>{options.map((option) => <option key={option.id} value={option.value}>{option.label}</option>)}</select> : <input required={required} maxLength={maxLength} aria-label={label} className="mt-1 block w-full rounded-lg border border-slate-300 p-2" value={value} onChange={(e) => onChange(name, e.target.value)} disabled={disabled} />}
  </label>;
}

function UploadForm({ onUploaded, options }) {
  const toast = useToast();
  const [file, setFile] = useState(null);
  const [fields, setFields] = useState(initialFields);
  const [progress, setProgress] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function submit(event) {
    event.preventDefault();
    setError('');
    if (!file) { setError('Choose a PowerPoint or Word document.'); return; }
    const form = new FormData();
    form.append('file', file);
    form.append('title', fields.title);
    form.append('subject', fields.subject);
    form.append('topic', fields.topic);
    form.append('subtopic', fields.subtopic);
    form.append('description', fields.description);
    if (fields.tags.trim()) form.append('tags', JSON.stringify(fields.tags.split(',').map((tag) => tag.trim()).filter(Boolean)));
    Object.entries(fields).filter(([key, value]) => value && !['title', 'subject', 'topic', 'subtopic', 'description', 'tags'].includes(key)).forEach(([key, value]) => form.append(key, value));
    setBusy(true);
    setProgress(0);
    try {
      const result = await apiUpload('/documents', form, { onProgress: setProgress });
      toast.success('Upload submitted for review.');
      setFile(null);
      setFields(initialFields);
      onUploaded(result.document);
    } catch (err) {
      setError(err.message);
      toast.error('The document could not be uploaded.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="rounded-xl border border-slate-200 bg-white p-5">
      <div className="flex items-center gap-2">
        <UploadCloud className="h-5 w-5 text-indigo-600" aria-hidden="true" />
        <h2 className="text-lg font-semibold">Upload a document</h2>
      </div>
      <p className="mt-1 text-sm text-slate-500">PPT, PPTX, DOC, or DOCX. Maximum 25 MB.</p>
      {error && <p role="alert" className="mt-4 rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</p>}
      <div className="mt-4 grid gap-4 sm:grid-cols-2">
        <label className="sm:col-span-2 text-sm font-medium">File
          <input className="mt-1 block w-full rounded-lg border border-slate-300 p-2 text-sm" type="file" accept=".ppt,.pptx,.doc,.docx" onChange={(e) => setFile(e.target.files?.[0] || null)} disabled={busy} />
        </label>
        <label className="text-sm font-medium">Document name <span className="text-red-600">*</span>
          <input required maxLength={200} className="mt-1 block w-full rounded-lg border border-slate-300 p-2" value={fields.title} onChange={(e) => setFields({ ...fields, title: e.target.value })} disabled={busy} />
        </label>
        <MetadataControl label="Field / Discipline" name="field_discipline" value={fields.field_discipline} options={options.field_discipline} onChange={(name, value) => setFields({ ...fields, [name]: value })} disabled={busy} />
        <MetadataControl label="Course / Program" name="course_program" value={fields.course_program} options={options.course_program} onChange={(name, value) => setFields({ ...fields, [name]: value })} disabled={busy} />
        <MetadataControl label="Semester / Study year" name="semester_study_year" value={fields.semester_study_year} options={options.semester_study_year} onChange={(name, value) => setFields({ ...fields, [name]: value })} disabled={busy} />
        <MetadataControl label="Subject" name="subject" value={fields.subject} options={options.subject} onChange={(name, value) => setFields({ ...fields, [name]: value })} required disabled={busy} />
        <MetadataControl label="Document type" name="document_type" value={fields.document_type} options={options.document_type} onChange={(name, value) => setFields({ ...fields, [name]: value })} disabled={busy} />
        <MetadataControl label="Academic year" name="academic_year" value={fields.academic_year} options={options.academic_year} onChange={(name, value) => setFields({ ...fields, [name]: value })} maxLength={20} disabled={busy} />
        <MetadataControl label="College / University" name="college_university" value={fields.college_university} options={options.college_university} onChange={(name, value) => setFields({ ...fields, [name]: value })} disabled={busy} />
        <label className="text-sm font-medium">Tags <span className="font-normal text-slate-500">(comma-separated)</span>
          <input className="mt-1 block w-full rounded-lg border border-slate-300 p-2" value={fields.tags} onChange={(e) => setFields({ ...fields, tags: e.target.value })} disabled={busy} />
        </label>
        <label className="text-sm font-medium">Topic
          <input maxLength={100} className="mt-1 block w-full rounded-lg border border-slate-300 p-2" value={fields.topic} onChange={(e) => setFields({ ...fields, topic: e.target.value })} disabled={busy} />
        </label>
        <label className="text-sm font-medium">Subtopic
          <input maxLength={100} className="mt-1 block w-full rounded-lg border border-slate-300 p-2" value={fields.subtopic} onChange={(e) => setFields({ ...fields, subtopic: e.target.value })} disabled={busy} />
        </label>
        <label className="text-sm font-medium">Description
          <textarea maxLength={2000} className="mt-1 block w-full rounded-lg border border-slate-300 p-2" value={fields.description} onChange={(e) => setFields({ ...fields, description: e.target.value })} disabled={busy} />
        </label>
      </div>
      {busy && <progress className="mt-4 h-2 w-full" max="100" value={progress}>{progress}%</progress>}
      <button type="submit" disabled={busy} className="mt-4 rounded-lg bg-indigo-600 px-4 py-2 font-medium text-white hover:bg-indigo-700 disabled:opacity-60">{busy ? `Uploading ${progress}%` : 'Upload for review'}</button>
    </form>
  );
}

function UploadRow({ document, onChange, onDelete, options }) {
  const [fields, setFields] = useState({
    title: document.title,
    subject: document.subject,
    topic: document.topic || '',
    subtopic: document.subtopic || '',
    description: document.description || '',
    tags: (document.tags || []).join(', '),
    field_discipline: document.fieldDiscipline || '',
    course_program: document.courseProgram || '',
    semester_study_year: document.semesterStudyYear || '',
    document_type: document.documentType || '',
    academic_year: document.academicYear || '',
    college_university: document.collegeUniversity || '',
  });
  const [busy, setBusy] = useState(false);
  const toast = useToast();

  async function save() {
    setBusy(true);
    try {
      const result = await updateDocument(document.id, {
        ...fields,
        tags: fields.tags.split(',').map((tag) => tag.trim()).filter(Boolean),
        field_discipline: fields.field_discipline,
        course_program: fields.course_program,
        semester_study_year: fields.semester_study_year,
        document_type: fields.document_type,
        academic_year: fields.academic_year,
        college_university: fields.college_university,
      });
      onChange(result.document);
      toast.success('Document details updated.');
    } catch (err) {
      toast.error(err.message);
    } finally { setBusy(false); }
  }

  return (
    <article className="rounded-xl border border-slate-200 bg-white p-5">
      <div className="flex items-start justify-between gap-4">
        <div className="flex min-w-0 items-start gap-3"><FileText className="mt-1 h-5 w-5 shrink-0 text-indigo-600" aria-hidden="true" /><div><p className="truncate font-medium">{document.originalFilename}</p><p className="text-sm text-slate-500">{formatSize(document.fileSize)} · {document.status}</p>{document.rejectionReason && <p className="mt-1 text-sm text-red-600">{document.rejectionReason}</p>}</div></div>
        <button type="button" aria-label={`Delete ${document.title}`} onClick={onDelete} className="rounded-lg p-2 text-red-600 hover:bg-red-50"><Trash2 className="h-4 w-4" aria-hidden="true" /></button>
      </div>
      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <input aria-label="Title" maxLength={200} className="rounded-lg border border-slate-300 p-2" value={fields.title} onChange={(e) => setFields({ ...fields, title: e.target.value })} disabled={busy} />
        <input aria-label="Subject" maxLength={100} className="rounded-lg border border-slate-300 p-2" value={fields.subject} onChange={(e) => setFields({ ...fields, subject: e.target.value })} disabled={busy} />
        <MetadataControl label="Field / Discipline" name="field_discipline" value={fields.field_discipline} options={options.field_discipline} onChange={(name, value) => setFields({ ...fields, [name]: value })} disabled={busy} />
        <MetadataControl label="Course / Program" name="course_program" value={fields.course_program} options={options.course_program} onChange={(name, value) => setFields({ ...fields, [name]: value })} disabled={busy} />
        <MetadataControl label="Semester / Study year" name="semester_study_year" value={fields.semester_study_year} options={options.semester_study_year} onChange={(name, value) => setFields({ ...fields, [name]: value })} disabled={busy} />
        <MetadataControl label="Document type" name="document_type" value={fields.document_type} options={options.document_type} onChange={(name, value) => setFields({ ...fields, [name]: value })} disabled={busy} />
        <MetadataControl label="Academic year" name="academic_year" value={fields.academic_year} options={options.academic_year} onChange={(name, value) => setFields({ ...fields, [name]: value })} disabled={busy} />
        <MetadataControl label="College / University" name="college_university" value={fields.college_university} options={options.college_university} onChange={(name, value) => setFields({ ...fields, [name]: value })} disabled={busy} />
        <input aria-label="Topic" maxLength={100} className="rounded-lg border border-slate-300 p-2" value={fields.topic} onChange={(e) => setFields({ ...fields, topic: e.target.value })} disabled={busy} />
        <input aria-label="Subtopic" maxLength={100} className="rounded-lg border border-slate-300 p-2" value={fields.subtopic} onChange={(e) => setFields({ ...fields, subtopic: e.target.value })} disabled={busy} />
        <input aria-label="Tags" maxLength={500} className="rounded-lg border border-slate-300 p-2" value={fields.tags} onChange={(e) => setFields({ ...fields, tags: e.target.value })} disabled={busy} />
        <textarea aria-label="Description" maxLength={2000} className="rounded-lg border border-slate-300 p-2 sm:col-span-2" value={fields.description} onChange={(e) => setFields({ ...fields, description: e.target.value })} disabled={busy} />
      </div>
      <button type="button" onClick={save} disabled={busy} className="mt-3 rounded-lg border border-slate-300 px-3 py-1.5 text-sm font-medium hover:bg-slate-50 disabled:opacity-60">{busy ? 'Saving…' : 'Save details'}</button>
    </article>
  );
}

export default function MyUploads() {
  const toast = useToast();
  const [documents, setDocuments] = useState([]);
  const [error, setError] = useState('');
  const [options, setOptions] = useState({});
  useEffect(() => {
    Promise.all([getMyUploads(), getMetadataOptions()])
      .then(([uploads, optionResult]) => {
        setDocuments(uploads.documents);
        setOptions((optionResult.options || []).reduce((grouped, option) => ({ ...grouped, [option.fieldKey]: [...(grouped[option.fieldKey] || []), option] }), {}));
      }).catch((err) => setError(err.message));
  }, []);

  async function remove(document) {
    if (!window.confirm(`Delete ${document.originalFilename}?`)) return;
    try { await deleteDocument(document.id); setDocuments((items) => items.filter((item) => item.id !== document.id)); toast.success('Document deleted.'); }
    catch (err) { toast.error(err.message); }
  }

  return (
    <div className="mx-auto max-w-4xl space-y-8">
      <div><h1 className="text-2xl font-bold text-slate-900">My uploads</h1><p className="mt-2 text-slate-600">Upload study materials and track their moderation status.</p></div>
      <UploadForm options={options} onUploaded={(document) => setDocuments((items) => [document, ...items])} />
      {error && <p role="alert" className="rounded-lg bg-red-50 p-3 text-red-700">{error}</p>}
      <section className="space-y-4"><h2 className="text-lg font-semibold">Your documents</h2>{documents.length ? documents.map((document) => <UploadRow key={document.id} options={options} document={document} onChange={(next) => setDocuments((items) => items.map((item) => item.id === next.id ? next : item))} onDelete={() => remove(document)} />) : <p className="rounded-xl border border-dashed border-slate-300 p-8 text-center text-slate-500">No uploads yet.</p>}</section>
    </div>
  );
}
