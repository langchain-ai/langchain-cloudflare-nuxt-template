import vuetify, { transformAssetUrls } from "vite-plugin-vuetify";

// https://nuxt.com/docs/api/configuration/nuxt-config
export default defineNuxtConfig({
  //...
  // devtools: { enabled: true },
  build: {
    transpile: ["vuetify"],
  },
  nitro: {
    // Useful for debugging
    // minify: false,
    commands: {
      preview:
        "npx wrangler dev ./server/index.mjs --site ./public --remote --port 3000",
    },
  },
  css: ["~/assets/css/style.css"],
  modules: [
    (_options, nuxt) => {
      nuxt.hooks.hook("vite:extendConfig", (config) => {
        // @ts-expect-error
        config.plugins.push(vuetify({ autoImport: true }));
      });
    },
    //...
  ],
  vite: {
    vue: {
      template: {
        transformAssetUrls,
      },
    },
  },
});
