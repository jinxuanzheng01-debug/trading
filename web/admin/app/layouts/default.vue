<script setup lang="ts">
const auth = useAuth()
</script>

<template>
  <SidebarProvider>
    <LayoutAppSidebar />
    <SidebarInset>
      <LayoutHeader>
        <div class="flex items-center gap-2">
          <DropdownMenu>
            <DropdownMenuTrigger as-child>
              <Button variant="ghost" class="relative size-8 rounded-full">
                <Avatar class="size-8">
                  <AvatarFallback>
                    {{ auth.user.value?.username?.charAt(0).toUpperCase() || 'U' }}
                  </AvatarFallback>
                </Avatar>
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" class="w-56">
              <DropdownMenuLabel class="flex flex-col items-start">
                <p class="text-sm font-medium">
                  {{ auth.user.value?.username }}
                </p>
                <p class="text-xs text-muted-foreground">
                  {{ auth.user.value?.email }}
                </p>
              </DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuItem>
                <NuxtLink to="/settings/profile" class="flex items-center gap-2 w-full">
                  <Icon name="i-lucide-user" class="size-4" />
                  Profile
                </NuxtLink>
              </DropdownMenuItem>
              <DropdownMenuItem>
                <NuxtLink to="/settings/account" class="flex items-center gap-2 w-full">
                  <Icon name="i-lucide-settings" class="size-4" />
                  Settings
                </NuxtLink>
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem @click="auth.logout()">
                <Icon name="i-lucide-log-out" class="size-4" />
                Logout
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </LayoutHeader>
      <div class="flex flex-col flex-1">
        <div class="@container/main p-4 lg:p-6 grow">
          <slot />
        </div>
      </div>
    </SidebarInset>
  </SidebarProvider>
</template>
