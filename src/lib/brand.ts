/** Branding is configurable via env so it can be renamed without code changes. */
export const BRAND = {
  name: process.env.NEXT_PUBLIC_APP_NAME ?? "OCEAN",
  tagline: process.env.NEXT_PUBLIC_APP_TAGLINE ?? "Our world. Our conversations.",
};
