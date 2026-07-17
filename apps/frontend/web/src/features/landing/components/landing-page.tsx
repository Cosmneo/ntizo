import {
  Compass,
  Wrench,
  Users,
  HelpCircle,
  Heart,
  Globe,
  MapPin,
  Calendar,
} from "lucide-react";
import { Link } from "@tanstack/react-router";

const NAVY = "#0e1f37";
const ACCENT = "#007AFF";
const SOFT_BG = "#eef3fb";
const CARD = "#ffffff";
const MUTED = "#6b7a90";
const BORDER = "#dde6f3";

const NAV_ITEMS = [
  { key: "explore", label: "Explore", icon: Compass },
  { key: "services", label: "Services", icon: Wrench },
  { key: "providers", label: "Providers", icon: Users },
  { key: "how", label: "How it works", icon: HelpCircle },
] as const;

export function LandingPage() {
  return (
    <main style={page}>
      <Header />
      <Hero />
      <Footer />
    </main>
  );
}

function Header() {
  return (
    <header style={header}>
      <a href="/" style={logoLink}>
        <img src="/brand/logo-primary.svg" alt="Ntizo" style={{ height: 32 }} />
      </a>

      <nav style={navPill}>
        {NAV_ITEMS.map((item, i) => {
          const Icon = item.icon;
          const active = i === 0;
          return (
            <a
              key={item.key}
              href={`#${item.key}`}
              style={active ? navItemActive : navItem}
            >
              <Icon size={16} />
              <span>{item.label}</span>
            </a>
          );
        })}
      </nav>

      <div style={headerRight}>
        <button type="button" style={iconBtn} aria-label="Favorites">
          <Heart size={18} />
        </button>
        <button type="button" style={langBtn}>
          <Globe size={16} />
          <span>EN · USD</span>
        </button>
        <Link to={"/sign-in" as string} style={signInBtn}>
          Sign in
        </Link>
      </div>
    </header>
  );
}

function Hero() {
  return (
    <section style={hero}>
      <Cloud style={{ top: 20, left: 80, opacity: 0.6 }} />
      <Cloud style={{ top: 90, right: 120, opacity: 0.5, transform: "scale(0.7)" }} />
      <Sparkle style={{ top: 60, right: 60, color: ACCENT }} />
      <Sparkle style={{ bottom: 220, left: 40, color: NAVY }} />

      <div style={heroInner}>
        <div style={heroText}>
          <h1 style={heroH1}>
            <span>Find it.</span>
            <br />
            <span style={{ position: "relative", display: "inline-block" }}>
              Book it.
              <Underline />
            </span>
            <br />
            <span style={{ color: ACCENT }}>Done.</span>
          </h1>
          <p style={heroSub}>
            The global marketplace for trusted local services. Discover
            providers, compare packages, and book in seconds.
          </p>
        </div>

        <div style={heroIllustration} aria-hidden>
          <div style={blobBack} />
          <div style={blobFront} />
          <div style={ground} />
          <img
            src="/brand/icon-primary.svg"
            alt=""
            style={{
              position: "relative",
              width: 320,
              height: 320,
              filter: "drop-shadow(0 24px 48px rgba(14,31,55,0.18))",
            }}
          />
          <Sparkle style={{ top: 30, right: 30, color: ACCENT, transform: "scale(1.4)" }} />
          <Sparkle style={{ bottom: 80, left: 20, color: NAVY }} />
          <Sparkle style={{ top: 150, left: 0, color: ACCENT, transform: "scale(0.8)" }} />
        </div>
      </div>

      <SearchBar />
    </section>
  );
}

function Cloud({ style }: { style?: React.CSSProperties }) {
  return (
    <svg
      width="80"
      height="40"
      viewBox="0 0 80 40"
      style={{ position: "absolute", ...style }}
      aria-hidden
    >
      <ellipse cx="20" cy="25" rx="14" ry="10" fill="#fff" />
      <ellipse cx="40" cy="20" rx="18" ry="14" fill="#fff" />
      <ellipse cx="60" cy="25" rx="14" ry="10" fill="#fff" />
    </svg>
  );
}

function Sparkle({ style }: { style?: React.CSSProperties & { color?: string } }) {
  const color = style?.color ?? NAVY;
  return (
    <svg
      width="22"
      height="22"
      viewBox="0 0 24 24"
      fill="none"
      style={{ position: "absolute", ...style }}
      aria-hidden
    >
      <path
        d="M12 2 L13.5 10.5 L22 12 L13.5 13.5 L12 22 L10.5 13.5 L2 12 L10.5 10.5 Z"
        fill={color}
        opacity="0.7"
      />
    </svg>
  );
}

function Underline() {
  return (
    <svg
      width="100%"
      height="14"
      viewBox="0 0 200 14"
      style={{
        position: "absolute",
        left: 0,
        bottom: -6,
        width: "100%",
      }}
      aria-hidden
    >
      <path
        d="M2 8 Q 50 -2, 100 6 T 198 6"
        stroke={ACCENT}
        strokeWidth="4"
        strokeLinecap="round"
        fill="none"
      />
    </svg>
  );
}

function SearchBar() {
  return (
    <div style={searchOuter}>
      <div style={searchTabs}>
        {NAV_ITEMS.slice(0, 4).map((it, i) => {
          const Icon = it.icon;
          const active = i === 0;
          return (
            <button key={it.key} type="button" style={active ? tabActive : tab}>
              <Icon size={16} />
              <span>{it.label}</span>
            </button>
          );
        })}
      </div>

      <div style={searchPill}>
        <SearchField label="What" placeholder="Any service" icon={<Wrench size={18} />} />
        <SearchField label="Where" placeholder="Add city" icon={<MapPin size={18} />} />
        <SearchField label="When" placeholder="Any date" icon={<Calendar size={18} />} />
        <SearchField label="Who" placeholder="1 person" icon={<Users size={18} />} />
        <button type="button" style={searchBtn}>
          Search
        </button>
      </div>
    </div>
  );
}

function SearchField({
  label,
  placeholder,
  icon,
}: {
  label: string;
  placeholder: string;
  icon: React.ReactNode;
}) {
  return (
    <div style={searchField}>
      <div style={searchFieldIcon}>{icon}</div>
      <div style={searchFieldLabelWrap}>
        <div style={searchFieldLabel}>{label}</div>
        <div style={searchFieldValue}>{placeholder}</div>
      </div>
    </div>
  );
}

function Footer() {
  return (
    <>
      <footer style={footer}>
        <div style={footerGrid}>
          <div>
            <img
              src="/brand/logo-primary.svg"
              alt="Ntizo"
              style={{ height: 32 }}
            />
            <p style={footerDesc}>
              Your gateway to trusted local services across the globe — book,
              schedule, and pay all in one place.
            </p>
          </div>

          <FooterCol title="Support">
            <FooterMeta label="Toll Free Customer Care" value="+1 (800) 000-0000" />
            <FooterMeta label="Need live support?" value="hello@ntizo.com" />
          </FooterCol>

          <FooterCol title="Company">
            <FooterLink href="#">About</FooterLink>
            <FooterLink href="#">Contact</FooterLink>
            <FooterLink href="#">FAQ</FooterLink>
            <FooterLink to="/sign-up">Become a Provider</FooterLink>
            <FooterLink href="#">Careers</FooterLink>
          </FooterCol>

          <FooterCol title="Legal">
            <FooterLink href="#">Terms of Service</FooterLink>
            <FooterLink href="#">Privacy Policy</FooterLink>
            <FooterLink href="#">Cookie Policy</FooterLink>
            <FooterLink to="/admin">Admin</FooterLink>
          </FooterCol>

          <FooterCol title="Get the App">
            <a href="#" style={appBadge}>
              <span style={{ fontSize: 11, opacity: 0.8 }}>Download on the</span>
              <span style={{ fontSize: 15, fontWeight: 600 }}>App Store</span>
            </a>
            <a href="#" style={appBadge}>
              <span style={{ fontSize: 11, opacity: 0.8 }}>Get it on</span>
              <span style={{ fontSize: 15, fontWeight: 600 }}>Google Play</span>
            </a>
          </FooterCol>
        </div>

        <div style={footerBottom}>
          <div>
            <div style={{ fontSize: 13, color: MUTED, marginBottom: 12 }}>
              Our Socials
            </div>
            <div style={{ display: "flex", gap: 10 }}>
              <SocialIcon><FacebookGlyph /></SocialIcon>
              <SocialIcon><InstagramGlyph /></SocialIcon>
              <SocialIcon><XGlyph /></SocialIcon>
              <SocialIcon><LinkedInGlyph /></SocialIcon>
            </div>
          </div>
          <div style={{ textAlign: "right" }}>
            <div style={{ fontSize: 13, color: MUTED, marginBottom: 12 }}>
              Accepted Payment Methods
            </div>
            <div style={{ display: "flex", gap: 10, justifyContent: "flex-end", flexWrap: "wrap" }}>
              <PayChip color="#1a1f71">VISA</PayChip>
              <PayChip color="#eb001b">MC</PayChip>
              <PayChip color="#0066b2">AMEX</PayChip>
              <PayChip color="#003087">PayPal</PayChip>
              <PayChip color="#000">Apple Pay</PayChip>
              <PayChip color="#4285f4">G Pay</PayChip>
            </div>
          </div>
        </div>

        <div style={copyright}>
          © {new Date().getFullYear()} Ntizo. All rights reserved.
        </div>
      </footer>
    </>
  );
}

function FooterCol({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <div style={footerTitle}>{title}</div>
      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        {children}
      </div>
    </div>
  );
}

function FooterLink({
  to,
  href,
  children,
}: {
  to?: string;
  href?: string;
  children: React.ReactNode;
}) {
  if (to) return <Link to={to} style={footerLink}>{children}</Link>;
  return <a href={href ?? "#"} style={footerLink}>{children}</a>;
}

function FooterMeta({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div style={{ fontSize: 12, color: MUTED }}>{label}</div>
      <div style={{ fontSize: 14, color: NAVY, fontWeight: 600 }}>{value}</div>
    </div>
  );
}

function SocialIcon({ children }: { children: React.ReactNode }) {
  return (
    <a href="#" style={socialIcon} aria-label="social">
      {children}
    </a>
  );
}

function PayChip({ color, children }: { color: string; children: React.ReactNode }) {
  return (
    <span style={{ ...payChip, color }}>{children}</span>
  );
}

function FacebookGlyph() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
      <path d="M22 12a10 10 0 1 0-11.6 9.9v-7H8v-3h2.4V9.4c0-2.4 1.4-3.7 3.6-3.7 1 0 2.1.2 2.1.2v2.3h-1.2c-1.2 0-1.5.7-1.5 1.5V12H16l-.4 3h-2.2v7A10 10 0 0 0 22 12z" />
    </svg>
  );
}
function InstagramGlyph() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="2" y="2" width="20" height="20" rx="5" />
      <path d="M16 11.4A4 4 0 1 1 12.6 8 4 4 0 0 1 16 11.4z" />
      <line x1="17.5" y1="6.5" x2="17.5" y2="6.5" />
    </svg>
  );
}
function XGlyph() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
      <path d="M18.244 2H21l-6.52 7.45L22 22h-6.83l-4.78-6.27L4.8 22H2.04l6.97-7.97L2 2h6.91l4.32 5.7L18.244 2zm-1.196 18h1.86L7.06 4H5.07l11.978 16z" />
    </svg>
  );
}
function LinkedInGlyph() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
      <path d="M20.45 20.45h-3.55v-5.57c0-1.33-.02-3.04-1.85-3.04-1.85 0-2.14 1.45-2.14 2.94v5.67H9.36V9h3.4v1.56h.05c.47-.9 1.63-1.85 3.36-1.85 3.6 0 4.27 2.37 4.27 5.45v6.29zM5.34 7.43A2.06 2.06 0 1 1 5.34 3.3a2.06 2.06 0 0 1 0 4.13zM7.12 20.45H3.56V9h3.56v11.45z" />
    </svg>
  );
}

/* ---------- styles ---------- */

const page: React.CSSProperties = {
  minHeight: "100vh",
  background:
    "radial-gradient(ellipse at top, #e7f0ff 0%, #f3f7ff 40%, #fafbff 100%)",
  fontFamily: "system-ui, -apple-system, 'Segoe UI', sans-serif",
  color: NAVY,
};

const header: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: 16,
  padding: "20px 48px",
  maxWidth: 1320,
  margin: "0 auto",
};

const logoLink: React.CSSProperties = { display: "inline-flex" };

const navPill: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 4,
  background: CARD,
  padding: 6,
  borderRadius: 999,
  border: `1px solid ${BORDER}`,
  boxShadow: "0 4px 16px rgba(14, 31, 55, 0.06)",
};

const navItem: React.CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  gap: 6,
  padding: "10px 16px",
  borderRadius: 999,
  fontSize: 13,
  fontWeight: 500,
  color: NAVY,
  textDecoration: "none",
};

const navItemActive: React.CSSProperties = {
  ...navItem,
  background: NAVY,
  color: "#fff",
};

const headerRight: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 8,
};

const iconBtn: React.CSSProperties = {
  width: 38,
  height: 38,
  borderRadius: 999,
  border: `1px solid ${BORDER}`,
  background: CARD,
  color: NAVY,
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  cursor: "pointer",
};

const langBtn: React.CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  gap: 6,
  padding: "9px 14px",
  borderRadius: 999,
  border: `1px solid ${BORDER}`,
  background: CARD,
  fontSize: 13,
  fontWeight: 500,
  color: NAVY,
  cursor: "pointer",
};

const signInBtn: React.CSSProperties = {
  padding: "10px 18px",
  borderRadius: 999,
  background: NAVY,
  color: "#fff",
  textDecoration: "none",
  fontSize: 13,
  fontWeight: 600,
};

const hero: React.CSSProperties = {
  position: "relative",
  maxWidth: 1320,
  margin: "0 auto",
  padding: "40px 48px 80px",
};

const heroInner: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "1.5fr 1fr",
  gap: 32,
  alignItems: "center",
};

const heroText: React.CSSProperties = {};

const heroH1: React.CSSProperties = {
  fontSize: 56,
  lineHeight: 1.05,
  margin: 0,
  fontWeight: 800,
  letterSpacing: "-0.02em",
};

const heroSub: React.CSSProperties = {
  marginTop: 20,
  maxWidth: 440,
  fontSize: 14,
  lineHeight: 1.6,
  color: MUTED,
};

const heroIllustration: React.CSSProperties = {
  position: "relative",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  height: 380,
};

const blobBack: React.CSSProperties = {
  position: "absolute",
  width: 420,
  height: 420,
  borderRadius: "50%",
  background:
    "radial-gradient(circle, rgba(0,122,255,0.22) 0%, rgba(0,122,255,0) 70%)",
};

const blobFront: React.CSSProperties = {
  position: "absolute",
  width: 280,
  height: 280,
  borderRadius: "50%",
  background:
    "radial-gradient(circle, rgba(255,255,255,0.9) 0%, rgba(255,255,255,0) 70%)",
};

const ground: React.CSSProperties = {
  position: "absolute",
  bottom: 30,
  width: 320,
  height: 28,
  borderRadius: "50%",
  background:
    "radial-gradient(ellipse, rgba(14,31,55,0.18) 0%, rgba(14,31,55,0) 70%)",
  filter: "blur(4px)",
};

const searchOuter: React.CSSProperties = {
  marginTop: 32,
  display: "flex",
  flexDirection: "column",
  alignItems: "center",
  gap: 14,
};

const searchTabs: React.CSSProperties = {
  display: "flex",
  gap: 24,
  background: "transparent",
};

const tab: React.CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  gap: 6,
  padding: "6px 2px",
  border: "none",
  background: "transparent",
  fontSize: 12,
  fontWeight: 500,
  color: MUTED,
  cursor: "pointer",
  borderBottom: "2px solid transparent",
};

const tabActive: React.CSSProperties = {
  ...tab,
  color: ACCENT,
  fontWeight: 700,
  borderBottom: `2px solid ${ACCENT}`,
};

const searchPill: React.CSSProperties = {
  width: "100%",
  maxWidth: 880,
  display: "flex",
  alignItems: "center",
  background: CARD,
  borderRadius: 999,
  padding: 8,
  border: `1px solid ${BORDER}`,
  boxShadow: "0 14px 36px rgba(14, 31, 55, 0.1)",
  gap: 2,
};

const searchField: React.CSSProperties = {
  flex: 1,
  display: "flex",
  alignItems: "center",
  gap: 8,
  padding: "6px 14px",
  cursor: "pointer",
  borderRadius: 999,
};

const searchFieldIcon: React.CSSProperties = {
  width: 22,
  height: 22,
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  color: MUTED,
  flexShrink: 0,
};

const searchFieldLabel: React.CSSProperties = {
  fontSize: 10,
  fontWeight: 700,
  color: NAVY,
  textTransform: "uppercase",
  letterSpacing: "0.05em",
};

const searchFieldValue: React.CSSProperties = {
  fontSize: 12,
  color: MUTED,
  marginTop: 1,
  whiteSpace: "nowrap",
};

const searchFieldLabelWrap: React.CSSProperties = {
  minWidth: 0,
};

const searchBtn: React.CSSProperties = {
  padding: "10px 22px",
  borderRadius: 999,
  background: ACCENT,
  color: "#fff",
  border: "none",
  fontSize: 13,
  fontWeight: 700,
  cursor: "pointer",
  marginLeft: 4,
};

const footer: React.CSSProperties = {
  marginTop: 60,
  background: "#f4f6fa",
  padding: "60px 48px 32px",
};

const footerGrid: React.CSSProperties = {
  maxWidth: 1320,
  margin: "0 auto",
  display: "grid",
  gridTemplateColumns: "1.4fr 1fr 1fr 1fr 1fr",
  gap: 40,
};

const footerDesc: React.CSSProperties = {
  marginTop: 16,
  fontSize: 13,
  lineHeight: 1.6,
  color: MUTED,
  maxWidth: 280,
};

const footerTitle: React.CSSProperties = {
  fontSize: 13,
  fontWeight: 700,
  color: NAVY,
  marginBottom: 16,
  textTransform: "uppercase",
  letterSpacing: "0.06em",
};

const footerLink: React.CSSProperties = {
  fontSize: 14,
  color: MUTED,
  textDecoration: "none",
};

const appBadge: React.CSSProperties = {
  display: "flex",
  flexDirection: "column",
  padding: "10px 16px",
  borderRadius: 12,
  background: NAVY,
  color: "#fff",
  textDecoration: "none",
  width: "fit-content",
};

const footerBottom: React.CSSProperties = {
  maxWidth: 1320,
  margin: "48px auto 0",
  paddingTop: 32,
  borderTop: `1px solid ${BORDER}`,
  display: "flex",
  alignItems: "flex-start",
  justifyContent: "space-between",
  gap: 24,
  flexWrap: "wrap",
};

const socialIcon: React.CSSProperties = {
  width: 38,
  height: 38,
  borderRadius: 999,
  background: "#e6ebf3",
  color: "#4a5b78",
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  textDecoration: "none",
};

const payChip: React.CSSProperties = {
  fontSize: 12,
  fontWeight: 800,
  background: CARD,
  border: `1px solid ${BORDER}`,
  padding: "8px 14px",
  borderRadius: 999,
  letterSpacing: "0.02em",
};

const copyright: React.CSSProperties = {
  maxWidth: 1320,
  margin: "32px auto 0",
  paddingTop: 24,
  borderTop: `1px solid ${BORDER}`,
  textAlign: "center",
  fontSize: 12,
  color: MUTED,
};
