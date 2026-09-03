import axios, { type AxiosInstance, type AxiosResponse } from "axios";
import type { z } from "zod";

export const API_TIMEOUT_MS = 15_000;

export const AUTH_ENDPOINTS = {
  LOGIN: "/auth/login",
  REGISTER: "/auth/register",
  REFRESH: "/auth/refresh",
  LOGOUT: "/auth/logout",
} as const;

export const baseURL = `${import.meta.env.VITE_BACKEND_API_URL}/api`;

export const apiClient: AxiosInstance = axios.create({
  baseURL,
  timeout: API_TIMEOUT_MS,
  withCredentials: true,
  headers: {
    "Content-Type": "application/json",
  },
});

export async function parseResponse<T>(
  request: Promise<AxiosResponse<unknown>>,
  schema: z.ZodType<T>,
): Promise<T> {
  const response = await request;
  return schema.parse(response.data);
}
