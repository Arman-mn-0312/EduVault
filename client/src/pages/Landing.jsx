import { Link } from 'react-router-dom';
import ServerStatus from '../components/ServerStatus.jsx';

export default function Landing() {
  return (
    <div className="grid gap-10 lg:grid-cols-[1.4fr_1fr] lg:items-start">
      <div>
        <h1 className="text-4xl font-bold tracking-tight text-slate-900 sm:text-5xl">
          Find the slides and notes your classmates already wrote.
        </h1>
        <p className="mt-5 max-w-xl text-lg text-slate-600">
          Upload your PowerPoint and Word study material, search what others have shared, and download the
          original files to use offline.
        </p>
        <div className="mt-8 flex flex-wrap gap-3">
          <Link to="/register" className="rounded-lg bg-indigo-600 px-5 py-2.5 font-medium text-white hover:bg-indigo-700">Create an account</Link>
          <Link to="/login" className="rounded-lg border border-slate-300 px-5 py-2.5 font-medium text-slate-700 hover:bg-slate-50">Log in</Link>
        </div>
        <p className="mt-6 text-sm text-slate-500">Share study material securely, find approved resources, and download the originals.</p>
      </div>
      <ServerStatus />
    </div>
  );
}
