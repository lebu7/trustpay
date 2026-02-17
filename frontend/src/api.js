// frontend/src/api.js
import axios from "axios";

const AUTH_BASE = import.meta.env.VITE_AUTH_URL;
const PAYMENT_BASE = import.meta.env.VITE_PAYMENT_URL;
const VERIFY_BASE = import.meta.env.VITE_VERIFY_URL;

if (!AUTH_BASE) throw new Error("Missing VITE_AUTH_URL");
if (!PAYMENT_BASE) throw new Error("Missing VITE_PAYMENT_URL");
if (!VERIFY_BASE) throw new Error("Missing VITE_VERIFY_URL");

export const authApi = axios.create({ baseURL: AUTH_BASE });
export const paymentApi = axios.create({ baseURL: PAYMENT_BASE });
export const verifyApi = axios.create({ baseURL: VERIFY_BASE });

export function setAuthToken(token) {
  const value = token ? `Bearer ${token}` : null;
  for (const client of [authApi, paymentApi, verifyApi]) {
    if (value) client.defaults.headers.common.Authorization = value;
    else delete client.defaults.headers.common.Authorization;
  }
}
