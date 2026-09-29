import type { NextConfig } from "next";
import { withBotId } from "botid/next/config";

const nextConfig: NextConfig = {
  /* config options here */
};

// Vercel BotID: menambahkan rute tantangan tak terlihat lewat domain situs
// sendiri. Dipakai untuk menahan bot di endpoint AI publik (kalkulator).
export default withBotId(nextConfig);
