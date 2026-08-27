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

/**
 * The two brands' own colours, kept out of the markup so the pair reads as a
 * set. Instagram has no single colour — the gradient is the mark — and this is
 * the linear approximation of it that its own brand assets use at small sizes.
 */
const INSTAGRAM = "linear-gradient(45deg, #F9CE34 0%, #EE2A7B 50%, #6228D7 100%)";
const LINKEDIN = "#0A66C2";

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
              <SocialIcon
                href="https://www.instagram.com/ntizo.mz/"
                label="Instagram"
                background={INSTAGRAM}
              >
                <InstagramGlyph />
              </SocialIcon>
              <SocialIcon
                href="https://www.linkedin.com/company/ntizo/"
                label="LinkedIn"
                background={LINKEDIN}
              >
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
              {/* Mobile money first, cards after: this is the order most of
                  Mozambique actually pays in. The four that left — AMEX,
                  PayPal, Apple Pay, G Pay — were never accepted; a footer
                  advertising a payment method the checkout will refuse is a
                  promise made to someone who has not paid yet. */}
              <PayChip color="#e60000">M-Pesa</PayChip>
              {/* TODO(ntizo): approximate. Nobody has checked this against
                  e-Mola's brand manual — replace it with their own hex. */}
              <PayChip color="#f58220">e-Mola</PayChip>
              <PayChip color="#1a1f71">Visa</PayChip>
              <PayChip color="#eb001b">Mastercard</PayChip>
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

/**
 * One social link, wearing its own brand colour.
 *
 * `label` is a prop rather than the fixed "social" it used to be: all four
 * icons announced themselves with the same word, so somebody listening to the
 * page was told there were links here and nothing about where any of them
 * went. With `href="#"` on every one, that was at least accurate.
 */
function SocialIcon({
  href,
  label,
  background,
  children,
}: {
  href: string;
  label: string;
  background: string;
  children: React.ReactNode;
}) {
  return (
    <a
      href={href}
      style={{ ...socialIcon, background }}
      aria-label={label}
      // Both of these leave the site, so both open away from it. `noopener` is
      // the half that matters: without it the opened page can reach back
      // through `window.opener` and navigate this one.
      target="_blank"
      rel="noopener noreferrer"
    >
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

/**
 * The shape only. Each icon supplies its own `background`, and the glyph is
 * white on top of it — which is why the colour is not here.
 */
const socialIcon: React.CSSProperties = {
  width: 38,
  height: 38,
  borderRadius: 999,
  color: "#fff",
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
