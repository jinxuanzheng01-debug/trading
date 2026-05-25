<script setup lang="ts">
definePageMeta({
  layout: 'blank',
})
</script>

<template>
  <LayoutAuth>
    <div class="grid mx-auto max-w-sm gap-6">
      <div class="grid gap-2 text-center">
        <h1 class="text-3xl font-bold">
          Trading Agent
        </h1>
        <p class="text-balance text-muted-foreground">
          Sign in to your account to continue
        </p>
      </div>
      <AuthSignIn />
    </div>
  </LayoutAuth>
</template>
