import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  cacheComponents: true,
  partialPrefetching: true,
  serverExternalPackages: ["better-sqlite3", "@react-pdf/renderer"],
  async redirects() {
    return [
      { source: "/", destination: "/settimana", permanent: false },
      // La vecchia pagina Orario è confluita nella Settimana.
      { source: "/orario", destination: "/settimana", permanent: false },
      // Lo Storico è stato tolto: le versioni di un piano restano nell'editor.
      { source: "/storico", destination: "/cartelle", permanent: false },
    ];
  },
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
