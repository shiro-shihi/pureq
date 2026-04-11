import type { HttpAdapter } from "../types/http";

export const fetchAdapter: HttpAdapter = async (url, init) => {
  return fetch(url, init);
};
