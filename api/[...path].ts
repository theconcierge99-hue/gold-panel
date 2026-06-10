import { dispatchApiRoute } from "../lib/concierge-api/api-router";

export const config = { runtime: "edge" };

export default function handler(request: Request): Promise<Response> {
  return dispatchApiRoute(request);
}
