export function LogoMark({ className = 'size-9' }) {
  return (
    <svg viewBox="0 0 40 40" className={className} aria-hidden="true">
      <defs>
        <linearGradient id="cf-drop" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#34d399" />
          <stop offset="1" stopColor="#059669" />
        </linearGradient>
      </defs>
      <rect width="40" height="40" rx="11" fill="#0b1b3a" />
      <path d="M20 7.5c4.6 5.8 8.2 10.4 8.2 15.1a8.2 8.2 0 0 1-16.4 0c0-4.7 3.6-9.3 8.2-15.1Z" fill="url(#cf-drop)" />
      <path d="M16.4 24a3.9 3.9 0 0 0 3.9 3.7" stroke="#fff" strokeWidth="2.2" strokeLinecap="round" fill="none" />
      <path d="M30.5 8.5l.9 2 2 .9-2 .9-.9 2-.9-2-2-.9 2-.9z" fill="#a7f3d0" />
    </svg>
  );
}

export default function Logo({ className = '', dark = false, size = 'size-9' }) {
  return (
    <span className={`inline-flex items-center gap-2.5 ${className}`}>
      <LogoMark className={size} />
      <span className={`text-lg font-extrabold tracking-tight ${dark ? 'text-white' : 'text-navy-900'}`}>
        CLEAN<span className="text-emerald-500">FLOW</span>
      </span>
    </span>
  );
}
