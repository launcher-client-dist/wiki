import { defineConfig } from "astro/config";
import mdx from "@astrojs/mdx";

export default defineConfig({
  site: "https://wiki.opengea.tech",
  trailingSlash: "always",
  build: { format: "directory" },
  integrations: [mdx()],
  devToolbar: { enabled: false },
});
