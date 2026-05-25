import type { OAuthConfig } from '#auth-utils';
export interface OAuthOsuConfig {
    /**
     * osu! OAuth Client ID
     * @default process.env.NUXT_OAUTH_OSU_CLIENT_ID
     */
    clientId?: string;
    /**
     * osu! OAuth Client Secret
     * @default process.env.NUXT_OAUTH_OSU_CLIENT_SECRET
     */
    clientSecret?: string;
    /**
     * osu! OAuth Scope
     *
     * The identify scope is always implicitly provided.
     * @default []
     * @see https://osu.ppy.sh/docs/#scopes
     */
    scope?: string[];
    /**
     * osu! OAuth Authorization URL
     * @default 'https://osu.ppy.sh/oauth/authorize'
     */
    authorizationURL?: string;
    /**
     * osu! OAuth Token URL
     * @default 'https://osu.ppy.sh/oauth/token'
     */
    tokenURL?: string;
    /**
     * Extra authorization parameters to provide to the authorization URL
     * @see 'https://osu.ppy.sh/docs/#authorization-code-grant'
     */
    authorizationParams?: Record<string, string>;
    /**
     * Redirect URL to to allow overriding for situations like prod failing to determine public hostname
     * @default process.env.NUXT_OAUTH_OSU_REDIRECT_URL or current URL
     */
    redirectURL?: string;
}
export declare function defineOAuthOsuEventHandler({ config, onSuccess, onError }: OAuthConfig<OAuthOsuConfig>): import("h3").EventHandler<import("h3").EventHandlerRequest, Promise<any>>;
