/**
 * The Monash domain rule, in one place.
 *
 * This deliberately mirrors MONASH_EMAIL_DOMAINS in
 * backend/app/services/user_service.py. The backend is the real enforcement -
 * it refuses to create a user row - and this copy only exists so the browser
 * can sign a rejected account out rather than dumping them on a page where
 * every request 403s.
 *
 * If the list ever changes, it has to change in both places.
 */
export const MONASH_EMAIL_DOMAINS = [
  "@student.monash.edu",
  "@monash.edu",
] as const;

export function isMonashEmail(email: string): boolean {
  const normalised = email.trim().toLowerCase();
  // The leading "@" anchors each domain, so a lookalike such as
  // "someone@notstudent.monash.edu" does not pass.
  return MONASH_EMAIL_DOMAINS.some((domain) => normalised.endsWith(domain));
}
