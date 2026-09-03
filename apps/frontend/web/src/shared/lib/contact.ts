/**
 * How to reach Ntizo, written once.
 *
 * Three addresses on one domain, decided 2026-09-02. Before this the code
 * carried `hello@ntizo.com` in the footer, `ola@ntizo.com` on the provider
 * pitch and `privacidade@ntizo.co.mz` in the policies — three domains' worth
 * of promises, two of them to inboxes nobody reads. Everything that prints an
 * address reads it from here; nothing types one in.
 */
export const CONTACT = {
  /** General correspondence, partnerships, press, careers; where the contact and feedback forms are forwarded. */
  general: "ola@ntizo.co.mz",
  /** Customers and providers with a problem — the help center's address; printed in the footer. */
  support: "suporte@ntizo.co.mz",
  /** Data requests, as the privacy policy says. */
  privacy: "privacidade@ntizo.co.mz",
  instagram: "https://www.instagram.com/ntizo.mz/",
  linkedin: "https://www.linkedin.com/company/ntizo/",
} as const;
