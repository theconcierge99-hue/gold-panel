import { getMppscanServerUrl, MPPSCAN_REGISTER_URL } from "../mpp-discovery";

/** Redirect to live MPPscan server profile (set MPPSCAN_SERVER_URL in Vercel). */
export default function handler(): Response {
  const target = getMppscanServerUrl() ?? MPPSCAN_REGISTER_URL;
  return new Response(null, {
    status: 302,
    headers: {
      Location: target,
      "Cache-Control": "no-store",
    },
  });
}
