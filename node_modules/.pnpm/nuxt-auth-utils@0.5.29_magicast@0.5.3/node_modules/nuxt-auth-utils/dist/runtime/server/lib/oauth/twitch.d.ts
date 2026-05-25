import type { OAuthConfig } from '#auth-utils';
export interface OAuthTwitchConfig {
    /**
     * Twitch Client ID
     * @default process.env.NUXT_OAUTH_TWITCH_CLIENT_ID
     */
    clientId?: string;
    /**
     * Twitch OAuth Client Secret
     * @default process.env.NUXT_OAUTH_TWITCH_CLIENT_SECRET
     */
    clientSecret?: string;
    /**
     * Twitch OAuth Scope
     * @default []
     * @see https://dev.twitch.tv/docs/authentication/scopes
     * @example ['user:read:email']
     */
    scope?: string[];
    /**
     * Require email from user, adds the ['user:read:email'] scope if not present
     * @default false
     */
    emailRequired?: boolean;
    /**
     * Twitch OAuth Authorization URL
     * @default 'https://id.twitch.tv/oauth2/authorize'
     */
    authorizationURL?: string;
    /**
     * Twitch OAuth Token URL
     * @default 'https://id.twitch.tv/oauth2/token'
     */
    tokenURL?: string;
    /**
     * Extra authorization parameters to provide to the authorization URL
     * @see https://dev.twitch.tv/docs/authentication/getting-tokens-oauth/#authorization-code-grant-flow
     * @example { force_verify: 'true' }
     */
    authorizationParams?: Record<string, string>;
    /**
     * Redirect URL to to allow overriding for situations like prod failing to determine public hostname
     * @default process.env.NUXT_OAUTH_TWITCH_REDIRECT_URL or current URL
     */
    redirectURL?: string;
}
interface TwitchUser {
    id: string;
    login: string;
    display_name: string;
    type: string;
    broadcaster_type: string;
    description: string;
    profile_image_url: string;
    offline_image_url: string;
    view_count: number;
    email?: string;
    created_at: string;
}
interface TwitchTokens {
    access_token: string;
    expires_in: number;
    refresh_token: string;
    scope: string[];
    token_type: string;
}
export declare function defineOAuthTwitchEventHandler({ config, onSuccess, onError }: OAuthConfig<OAuthTwitchConfig, {
    user: TwitchUser;
    tokens: TwitchTokens;
}>): import("h3").EventHandler<import("h3").EventHandlerRequest, Promise<any>>;
export {};
