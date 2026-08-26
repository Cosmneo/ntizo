/**
 * The site footer.
 *
 * Lifted out of `landing-page.tsx` when a second public page needed it. A
 * footer copied into two files is a footer that disagrees with itself the
 * first time a link changes — and the page that had no footer at all simply
 * ended, leaving the reader nowhere to go but back.
 */
import { useTranslation } from "react-i18next";
import { Link } from "@tanstack/react-router";
import {
  BORDER,
  CARD,
  MUTED,
  NAVY,
  PAGE_TOP,
} from "@/features/landing/ui/palette";

export function Footer() {
  const { t } = useTranslation("landing"); // t:Footer
  return (
    <>
      <footer style={footer}>
        <div className="mx-auto grid max-w-[1320px] grid-cols-2 gap-x-8 gap-y-10 sm:grid-cols-3 lg:grid-cols-[1.4fr_1fr_1fr_1fr_1fr] lg:gap-10">
          <div className="col-span-2 sm:col-span-3 lg:col-span-1">
            <img
              src="/brand/logo-primary.svg"
              alt="Ntizo"
              style={{ height: 28 }}
            />
            <p style={footerDesc}>
              Your gateway to trusted local services across the globe — book,
              schedule, and pay all in one place.
            </p>
          </div>

          <FooterCol title={t("footer.support")}>
            <FooterMeta
              label="Toll Free Customer Care"
              value="+1 (800) 000-0000"
            />
            <FooterMeta label="Need live support?" value="hello@ntizo.com" />
          </FooterCol>

          <FooterCol title={t("footer.company")}>
            <FooterLink href="#">{t("footer.about")}</FooterLink>
            <FooterLink href="#">{t("footer.contact")}</FooterLink>
            <FooterLink href="#">{t("footer.faq")}</FooterLink>
            {/* The public pitch, not registration. A link labelled "become a
                provider" that opens a sign-up form skips the part where someone
                finds out what they would be signing up for — and that page's
                own buttons carry the intent onward from there. */}
            <FooterLink to="/become-provider">
              {t("footer.becomeProvider")}
            </FooterLink>
            <FooterLink href="#">{t("footer.careers")}</FooterLink>
          </FooterCol>

          <FooterCol title={t("footer.legal")}>
            <FooterLink to="/terms">{t("footer.terms")}</FooterLink>
            <FooterLink to="/privacy">{t("footer.privacy")}</FooterLink>
            <FooterLink href="#">{t("footer.cookies")}</FooterLink>
            <FooterLink to="/admin">{t("admin")}</FooterLink>
          </FooterCol>

          <FooterCol title={t("footer.getTheApp")}>
            <a href="#" style={appBadge}>
              <span style={{ fontSize: 11, opacity: 0.8 }}>
                {t("footer.downloadOnThe")}
              </span>
              <span style={{ fontSize: 15, fontWeight: 600 }}>App Store</span>
            </a>
            <a href="#" style={appBadge}>
              <span style={{ fontSize: 11, opacity: 0.8 }}>
                {t("footer.getItOn")}
              </span>
              <span style={{ fontSize: 15, fontWeight: 600 }}>Google Play</span>
            </a>
          </FooterCol>
        </div>

        <div
          className="mx-auto mt-12 flex max-w-[1320px] flex-col items-start justify-between gap-6 border-t pt-8 sm:flex-row sm:items-center"
          style={{ borderColor: BORDER }}
        >
          <div>
            <div style={{ fontSize: 13, color: MUTED, marginBottom: 12 }}>
              {t("footer.ourSocials")}
            </div>
            <div style={{ display: "flex", gap: 10 }}>
              <SocialIcon>
                <FacebookGlyph />
              </SocialIcon>
              <SocialIcon>
                <InstagramGlyph />
              </SocialIcon>
              <SocialIcon>
                <XGlyph />
              </SocialIcon>
              <SocialIcon>
                <LinkedInGlyph />
              </SocialIcon>
            </div>
          </div>
          <div style={{ textAlign: "right" }}>
            <div style={{ fontSize: 13, color: MUTED, marginBottom: 12 }}>
              {t("footer.acceptedPayments")}
            </div>
            <div
              style={{
                display: "flex",
                gap: 10,
                justifyContent: "flex-end",
                flexWrap: "wrap",
              }}
            >
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
  if (to)
    return (
      <Link to={to} style={footerLink}>
        {children}
      </Link>
    );
  return (
    <a href={href ?? "#"} style={footerLink}>
      {children}
    </a>
  );
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

function PayChip({
  color,
  children,
}: {
  color: string;
  children: React.ReactNode;
}) {
  return <span style={{ ...payChip, color }}>{children}</span>;
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
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
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

/**
 * The footer's own styles.
 *
 * Layout moved to classes, values stayed here. Inline styles cannot carry a
 * media query, so the five-column grid held at every width — on a phone it was
 * five sixty-pixel columns of stacked words. Anything that has to change with
 * the viewport belongs in a class; anything that does not can stay.
 */
const footer: React.CSSProperties = {
  marginTop: 60,
  background: PAGE_TOP,
  // 24px, matching `.page-shell`'s gutter. At 48 the footer's content sat
  // inset from every section above it on anything narrower than ~1416px —
  // the same 1320 ceiling, a different edge.
  padding: "60px 24px 32px",
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

const socialIcon: React.CSSProperties = {
  width: 38,
  height: 38,
  borderRadius: 999,
  background: BORDER,
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
