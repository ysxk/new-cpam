interface LogoMarkProps {
  size?: number;
}

export default function LogoMark({ size = 34 }: LogoMarkProps) {
  return (
    <svg
      aria-hidden="true"
      className="logo-mark"
      height={size}
      viewBox="0 0 64 64"
      width={size}
    >
      <defs>
        <linearGradient id="cpam-logo-bg" x1="8" x2="56" y1="56" y2="8">
          <stop offset="0" stopColor="#23bfd3" />
          <stop offset="0.52" stopColor="#a7db88" />
          <stop offset="1" stopColor="#ffe01b" />
        </linearGradient>
      </defs>
      <path
        d="M32 3C42 17 47 22 61 32C47 42 42 47 32 61C22 47 17 42 3 32C17 22 22 17 32 3Z"
        fill="url(#cpam-logo-bg)"
      />
      <path
        d="M32 5C41 18 46 23 59 32C46 41 41 46 32 59C23 46 18 41 5 32C18 23 23 18 32 5Z"
        fill="none"
        stroke="#3b2a23"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="4.2"
      />
      <path
        d="M24.5 27.5C24.5 21 29.8 16.8 35.8 18.6C40.4 20 43.2 24.3 42.6 29.1"
        fill="none"
        stroke="#3b2a23"
        strokeLinecap="round"
        strokeWidth="4.4"
      />
      <path
        d="M39.5 25.2C45.5 25.2 49.6 30.5 47.8 36.4C46.4 41 42.1 43.8 37.3 43.2"
        fill="none"
        stroke="#3b2a23"
        strokeLinecap="round"
        strokeWidth="4.4"
      />
      <path
        d="M39.5 36.5C39.5 43 34.2 47.2 28.2 45.4C23.6 44 20.8 39.7 21.4 34.9"
        fill="none"
        stroke="#3b2a23"
        strokeLinecap="round"
        strokeWidth="4.4"
      />
      <path
        d="M24.5 38.8C18.5 38.8 14.4 33.5 16.2 27.6C17.6 23 21.9 20.2 26.7 20.8"
        fill="none"
        stroke="#3b2a23"
        strokeLinecap="round"
        strokeWidth="4.4"
      />
      <path
        d="M24.8 31.8L32 27.6L39.2 31.8V40.2L32 44.4L24.8 40.2V31.8Z"
        fill="none"
        stroke="#3b2a23"
        strokeLinejoin="round"
        strokeWidth="4"
      />
    </svg>
  );
}
