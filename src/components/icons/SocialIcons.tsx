type IconProps = { className?: string };

export function FacebookIcon({ className }: IconProps) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
    >
      <path d="M18 2h-3a5 5 0 0 0-5 5v3H7v4h3v8h4v-8h3l1-4h-4V7a1 1 0 0 1 1-1h3z" />
    </svg>
  );
}

export function InstagramIcon({ className }: IconProps) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
    >
      <rect x="2" y="2" width="20" height="20" rx="5" ry="5" />
      <path d="M16 11.37A4 4 0 1 1 12.63 8 4 4 0 0 1 16 11.37z" />
      <line x1="17.5" y1="6.5" x2="17.51" y2="6.5" />
    </svg>
  );
}

export function GoogleIcon({ className }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" className={className}>
      <path
        fill="#4285F4"
        d="M23.04 12.27c0-.82-.07-1.42-.22-2.04H12.24v3.91h6.17c-.12 1.02-.8 2.56-2.3 3.6l-.02.14 3.34 2.59.23.02c2.13-1.96 3.38-4.85 3.38-8.22Z"
      />
      <path
        fill="#34A853"
        d="M12.24 23.5c3.04 0 5.59-1 7.45-2.72l-3.55-2.75c-.95.66-2.22 1.13-3.9 1.13-2.98 0-5.51-1.96-6.41-4.66l-.13.01-3.47 2.68-.05.12c1.85 3.68 5.66 6.19 10.06 6.19Z"
      />
      <path
        fill="#FBBC05"
        d="M5.83 14.5a6.7 6.7 0 0 1-.36-2.15c0-.75.13-1.47.35-2.15l-.01-.14-3.51-2.72-.12.06A11.27 11.27 0 0 0 .77 12.35c0 1.82.44 3.54 1.21 5.05l3.85-2.9Z"
      />
      <path
        fill="#EA4335"
        d="M12.24 5.39c2.12 0 3.55.91 4.37 1.67l3.19-3.11C17.82 2.16 15.28 1 12.24 1 7.84 1 4.03 3.51 2.18 7.19l3.84 2.97c.91-2.7 3.44-4.77 6.22-4.77Z"
      />
    </svg>
  );
}

export function FacebookCircleIcon({ className }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" className={className}>
      <circle cx="12" cy="12" r="12" fill="#1877F2" />
      <path
        fill="#fff"
        d="M16 12.06h-2.2v6.94h-2.9v-6.94H9.4v-2.5h1.5V8.1c0-1.5.78-2.6 2.74-2.6h1.94v2.5h-1.2c-.5 0-.78.28-.78.78v1.78H16l-.3 2.5Z"
      />
    </svg>
  );
}

export function XIcon({ className }: IconProps) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
    >
      <path d="M4 4l16 16M20 4L4 20" />
    </svg>
  );
}
