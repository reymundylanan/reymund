export const GRAPH_VERSION = "v23.0";

export type MessengerConfig = {
  pageId: string;
  pageAccessToken: string;
  appSecret: string;
  verifyToken: string;
  dispatchSecret: string;
  pageUsername: string;
  siteUrl: string;
};

const ENV_KEYS: Record<keyof MessengerConfig, string> = {
  pageId: "MESSENGER_PAGE_ID",
  pageAccessToken: "MESSENGER_PAGE_ACCESS_TOKEN",
  appSecret: "MESSENGER_APP_SECRET",
  verifyToken: "MESSENGER_VERIFY_TOKEN",
  dispatchSecret: "MESSENGER_DISPATCH_SECRET",
  pageUsername: "NEXT_PUBLIC_MESSENGER_PAGE_USERNAME",
  siteUrl: "NEXT_PUBLIC_SITE_URL",
};

type Env = Record<string, string | undefined>;

export function missingMessengerEnv(env: Env = process.env): string[] {
  return Object.values(ENV_KEYS).filter((key) => !env[key]?.trim());
}

// Server-only: returns null unless every Messenger env var is set.
export function getMessengerConfig(env: Env = process.env): MessengerConfig | null {
  if (missingMessengerEnv(env).length > 0) return null;
  const read = (k: keyof MessengerConfig) => env[ENV_KEYS[k]]!.trim();
  return {
    pageId: read("pageId"),
    pageAccessToken: read("pageAccessToken"),
    appSecret: read("appSecret"),
    verifyToken: read("verifyToken"),
    dispatchSecret: read("dispatchSecret"),
    pageUsername: read("pageUsername"),
    siteUrl: read("siteUrl").replace(/\/+$/, ""),
  };
}
