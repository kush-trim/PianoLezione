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
      // Ci si iscrive accedendo con Google: la registrazione con password non c'è più.
      { source: "/registrati", destination: "/login", permanent: false },
      // Lo Storico è stato tolto: le versioni di un piano restano nell'editor.
      { source: "/storico", destination: "/piani", permanent: false },
      // Cartelle è diventata Piano Lezione, Esercizi è diventata File.
      { source: "/cartelle", destination: "/piani", permanent: false },
      { source: "/esercizi", destination: "/file", permanent: false },
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
