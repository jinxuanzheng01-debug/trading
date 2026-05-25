<script setup lang="ts">
definePageMeta({
  layout: 'blank',
})
</script>

<template>
  <LayoutAuth>
    <div class="grid mx-auto max-w-sm gap-6">
      <div class="flex flex-col text-center space-y-2">
        <h1 class="text-3xl font-bold">
          Trading Agent
        </h1>
        <p class="text-muted-foreground">
          Create an account to get started
        </p>
      </div>
      <AuthSignUp />
      <p class="text-center text-sm text-muted-foreground">
        Already have an account?
        <NuxtLink
          to="/login"
          class="underline underline-offset-4 hover:text-primary"
        >
          Login
        </NuxtLink>
      </p>
    </div>
  </LayoutAuth>
</template>
