import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "EndoDelivery",
    short_name: "EndoDelivery",
    description: "Seu prontuário endodôntico, onde você estiver.",
    lang: "pt-BR",
    start_url: "/patients",
    scope: "/",
    display: "standalone",
    background_color: "#F6F8F7",
    theme_color: "#145E58",
    orientation: "portrait-primary",
    icons: [
      { src: "/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
      { src: "/icon.svg", sizes: "any", type: "image/svg+xml", purpose: "any" },
    ],
  };
}
