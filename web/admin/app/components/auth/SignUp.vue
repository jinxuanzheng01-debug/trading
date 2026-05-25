<script setup lang="ts">
import { Loader2 } from 'lucide-vue-next'
import { cn } from '@/lib/utils'
import PasswordInput from '~/components/PasswordInput.vue'
import { toast } from 'vue-sonner'

const auth = useAuth()
const username = ref('')
const email = ref('')
const password = ref('')
const isLoading = ref(false)

async function onSubmit(event: Event) {
  event.preventDefault()

  if (!username.value || !email.value || !password.value)
    return

  if (password.value.length < 6) {
    toast.error('Password must be at least 6 characters')
    return
  }

  isLoading.value = true

  try {
    await auth.register(email.value, username.value, password.value)
    toast.success('Account created successfully')
    navigateTo('/', { replace: true })
  }
  catch (error: any) {
    toast.error(error.message || 'Registration failed')
  }
  finally {
    isLoading.value = false
  }
}
</script>

<template>
  <div :class="cn('grid gap-6', $attrs.class ?? '')">
    <form @submit="onSubmit">
      <div class="grid gap-4">
        <div class="grid gap-2">
          <Label for="username">
            Username
          </Label>
          <Input
            id="username"
            v-model="username"
            placeholder="Enter your username"
            type="text"
            auto-capitalize="none"
            auto-complete="username"
            auto-correct="off"
            :disabled="isLoading"
          />
        </div>
        <div class="grid gap-2">
          <Label for="email">
            Email
          </Label>
          <Input
            id="email"
            v-model="email"
            placeholder="name@example.com"
            type="email"
            auto-capitalize="none"
            auto-complete="email"
            auto-correct="off"
            :disabled="isLoading"
          />
        </div>
        <div class="grid gap-2">
          <Label for="password">
            Password
          </Label>
          <PasswordInput id="password" v-model="password" />
          <p class="text-xs text-muted-foreground">
            Must be at least 6 characters
          </p>
        </div>
        <Button :disabled="isLoading" class="w-full">
          <Loader2 v-if="isLoading" class="mr-2 h-4 w-4 animate-spin" />
          Create Account
        </Button>
      </div>
    </form>
  </div>
</template>
