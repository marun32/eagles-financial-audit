declare namespace Cloudflare {
  interface Env {
    DB?: D1Database;
    BUCKET?: R2Bucket;
    NEBIUS_API_KEY?: string;
    NEBIUS_MODEL?: string;
    EAGLES_ADMIN_EMAIL?: string;
  }
}
