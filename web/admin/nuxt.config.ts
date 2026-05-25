import tailwindcss from '@tailwindcss/vite'
// https://nuxt.com/docs/api/configuration/nuxt-config
export default defineNuxtConfig({
  devtools: { enabled: true },

  css: ['~/assets/css/tailwind.css'],
  vite: {
    plugins: [tailwindcss()],
  },

  components: [
    {
      path: '~/components',
      extensions: ['.vue'],
    },
  ],

  modules: [
    'shadcn-nuxt',
    '@vueuse/nuxt',
    '@nuxt/eslint',
    '@nuxt/icon',
    '@pinia/nuxt',
    '@nuxtjs/color-mode',
    '@nuxt/fonts',
  ],

  shadcn: {
    prefix: '',
    componentDir: '~/components/ui',
  },

  colorMode: {
    classSuffix: '',
  },

  eslint: {
    config: {
      standalone: false,
    },
  },

  fonts: {
    defaults: {
      weights: [300, 400, 500, 600, 700, 800],
    },
  },

  imports: {
    dirs: ['./lib'],
  },

  compatibilityDate: '2024-12-14',

  runtimeConfig: {
    apiBaseInternal: process.env.NUXT_API_PROXY_TARGET || 'http://api:4000',
    agentInternal: process.env.NUXT_AGENT_PROXY_TARGET || 'http://voltagent:4001',
    backtestInternal: process.env.NUXT_BACKTEST_PROXY_TARGET || 'http://backtest:8002',
    public: {
      apiBase: process.env.NUXT_PUBLIC_API_BASE || '',
      marketDataApiBase: process.env.NUXT_PUBLIC_MARKET_DATA_API_BASE || 'http://localhost:8000',
    },
  },
})
