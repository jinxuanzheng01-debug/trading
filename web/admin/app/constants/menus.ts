import type { NavMenu, NavMenuItems } from '~/types/nav'

export const navMenu: NavMenu[] = [
  {
    heading: 'Trading',
    items: [
      {
        title: 'Dashboard',
        icon: 'i-lucide-layout-dashboard',
        link: '/',
      },
      {
        title: 'Watchlist',
        icon: 'i-lucide-star',
        link: '/watchlist',
      },
      {
        title: 'Stocks',
        icon: 'i-lucide-list',
        link: '/stocks',
      },
      {
        title: 'Paper Trading',
        icon: 'i-lucide-wallet',
        link: '/paper',
      },
      {
        title: 'Market',
        icon: 'i-lucide-trending-up',
        link: '/market',
        disabled: true,
      },
    ],
  },
  {
    heading: 'Analysis',
    items: [
      {
        title: 'AI Research',
        icon: 'i-lucide-brain',
        link: '/research',
      },
      {
        title: 'Backtest',
        icon: 'i-lucide-flask-conical',
        link: '/strategy/backtest',
      },
      {
        title: 'Screener',
        icon: 'i-lucide-filter',
        link: '/screener',
        disabled: true,
      },
    ],
  },
  {
    heading: 'System',
    items: [
      {
        title: 'Logs',
        icon: 'i-lucide-file-text',
        link: '/logs',
      },
    ],
  },
  {
    heading: 'Settings',
    items: [
      {
        title: 'Profile',
        icon: 'i-lucide-user',
        link: '/settings/profile',
      },
      {
        title: 'Account',
        icon: 'i-lucide-settings',
        link: '/settings/account',
      },
      {
        title: 'API Keys',
        icon: 'i-lucide-key',
        link: '/settings/api-keys',
        disabled: true,
      },
    ],
  },
]

export const navMenuBottom: NavMenuItems = [
  {
    title: 'Documentation',
    icon: 'i-lucide-book-open',
    link: '/docs',
  },
  {
    title: 'Support',
    icon: 'i-lucide-message-square',
    link: '/support',
  },
]
