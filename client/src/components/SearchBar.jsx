import { useEffect, useRef, useState } from 'react';
import { Search } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { suggestDocuments } from '../services/api.js';

export default function SearchBar() {
  const navigate = useNavigate();
  const [value, setValue] = useState('');
  const [suggestions, setSuggestions] = useState([]);
  const [error, setError] = useState('');
  const request = useRef(null);

  useEffect(() => {
    const query = value.trim();
    setError('');
    if (query.length < 2) { setSuggestions([]); return undefined; }
    const timer = setTimeout(async () => {
      request.current?.abort();
      const controller = new AbortController();
      request.current = controller;
      try {
        const result = await suggestDocuments(query, { signal: controller.signal });
        setSuggestions(result.suggestions || []);
      } catch (err) {
        if (err.name !== 'AbortError') { setSuggestions([]); setError('Suggestions unavailable.'); }
      }
    }, 250);
    return () => clearTimeout(timer);
  }, [value]);

  function submit(event) {
    event.preventDefault();
    if (value.trim().length < 2) return;
    setSuggestions([]);
    navigate(`/search?q=${encodeURIComponent(value.trim())}`);
  }

  return (
    <form onSubmit={submit} className="relative hidden w-full max-w-md md:block" role="search">
      <Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-slate-400" aria-hidden="true" />
      <input aria-label="Search documents" value={value} onChange={(event) => setValue(event.target.value)} placeholder="Search documents…" className="w-full rounded-lg border border-slate-300 py-2 pl-9 pr-3 text-sm" />
      {(suggestions.length > 0 || error) && (
        <div className="absolute left-0 right-0 top-11 z-40 rounded-lg border border-slate-200 bg-white p-1 shadow-lg" role="listbox">
          {error && <p className="p-2 text-xs text-red-600">{error}</p>}
          {suggestions.map((suggestion) => (
            <button key={suggestion.id} type="button" role="option" className="block w-full rounded-md p-2 text-left hover:bg-slate-50" onClick={() => navigate(`/documents/${suggestion.id}`)}>
              <span className="block text-sm font-medium">{suggestion.title}</span>
              <span className="block text-xs text-slate-500">{suggestion.subject} · {suggestion.fileExtension}</span>
            </button>
          ))}
        </div>
      )}
    </form>
  );
}

