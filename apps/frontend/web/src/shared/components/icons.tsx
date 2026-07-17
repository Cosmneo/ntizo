import type { SVGProps } from "react";

export function NtizoLogo(props: { className?: string }) {
  return (
    <img
      src="/brand/logo-primary.svg"
      alt="Ntizo"
      className={props.className}
    />
  );
}

export function NtizoIcon(props: { className?: string }) {
  return (
    <img
      src="/brand/icon-primary.svg"
      alt="Ntizo"
      className={props.className}
    />
  );
}

export function GoogleIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" {...props}>
      <path
        fill="#EA4335"
        d="M12 10.2v3.9h5.5c-.2 1.3-1.7 3.9-5.5 3.9-3.3 0-6-2.7-6-6s2.7-6 6-6c1.9 0 3.1.8 3.8 1.5l2.6-2.5C16.8 3.4 14.6 2.4 12 2.4 6.8 2.4 2.6 6.6 2.6 11.8S6.8 21.2 12 21.2c6.9 0 11.5-4.9 11.5-11.7 0-.8-.1-1.4-.2-2z"
      />
    </svg>
  );
}

export function MicrosoftIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" {...props}>
      <path fill="#F25022" d="M2 2h10v10H2z" />
      <path fill="#7FBA00" d="M12 2h10v10H12z" />
      <path fill="#00A4EF" d="M2 12h10v10H2z" />
      <path fill="#FFB900" d="M12 12h10v10H12z" />
    </svg>
  );
}
