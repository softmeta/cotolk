import {
  deleteCookie,
  getCookie,
  setCookie,
} from "@tanstack/react-start/server";

function secureCookies() {
  return (process.env.COTOLK_PUBLIC_URL ?? "").startsWith("https://");
}

function cookieName() {
  return secureCookies() ? "__Host-cotolk_session" : "cotolk_session";
}

function cookieOptions() {
  return {
    httpOnly: true,
    secure: secureCookies(),
    sameSite: "lax",
    path: "/",
  } as const;
}

export function setSessionCookie(token: string, expiresAt: Date) {
  setCookie(cookieName(), token, { ...cookieOptions(), expires: expiresAt });
}

export function clearSessionCookie() {
  deleteCookie(cookieName(), cookieOptions());
}

export function readSessionToken() {
  return getCookie(cookieName()) ?? null;
}
