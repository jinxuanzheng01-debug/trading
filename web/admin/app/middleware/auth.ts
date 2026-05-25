export default defineNuxtRouteMiddleware((to, from) => {
  const token = useCookie('auth_token')

  if (!token.value && to.path !== '/login' && to.path !== '/register') {
    return navigateTo('/login')
  }
})
