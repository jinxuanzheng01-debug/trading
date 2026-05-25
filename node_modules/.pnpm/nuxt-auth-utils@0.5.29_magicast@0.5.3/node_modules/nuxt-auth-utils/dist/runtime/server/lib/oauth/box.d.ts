import type { OAuthConfig } from '#auth-utils';
export interface OAuthBoxConfig {
    /**
     * Box OAuth Client ID
     * @default process.env.NUXT_OAUTH_BOX_CLIENT_ID
     */
    clientId?: string;
    /**
     * Box OAuth Client Secret
     * @default process.env.NUXT_OAUTH_BOX_CLIENT_SECRET
     */
    clientSecret?: string;
    /**
     * Box OAuth Scope
     * @default []
     * @see https://developer.box.com/guides/api-calls/permissions-and-errors/scopes/
     */
    scope?: string[];
    /**
     * Box OAuth Authorization URL
     * @default 'https://account.box.com/api/oauth2/authorize'
     */
    authorizationURL?: string;
    /**
     * Box OAuth Token URL
     * @default 'https://api.box.com/oauth2/token'
     */
    tokenURL?: string;
    /**
     * Box User Info URL
     * @default 'https://api.box.com/2.0/users/me'
     */
    userURL?: string;
    /**
     * Extra authorization parameters to provide to the authorization URL
     * @see https://developer.box.com/guides/authentication/oauth2/oauth2-setup/
     */
    authorizationParams?: Record<string, string>;
    /**
     * Redirect URL to allow overriding for situations like prod failing to determine public hostname
     * @default process.env.NUXT_OAUTH_BOX_REDIRECT_URL
     */
    redirectURL?: string;
}
/**
 * Box User object returned from /2.0/users/me
 * @see https://developer.box.com/reference/get-users-me/
 * @see https://www.postman.com/boxdev/box-s-public-workspace/example/8119550-f7344611-7834-4040-a4ae-d6b3ef95bfdb
 */
interface OAuthBoxUser {
    type: 'user';
    id: string;
    name: string;
    login: string;
    created_at: string;
    modified_at: string;
    language: string;
    timezone: string;
    space_amount: number;
    space_used: number;
    max_upload_size: number;
    status: 'active' | 'inactive' | 'cannot_delete_edit' | 'cannot_delete_edit_upload';
    job_title?: string;
    phone?: string;
    address?: string;
    avatar_url?: string;
}
/**
 * Box OAuth tokens
 * @see https://developer.box.com/reference/post-oauth2-token/
 * @see https://www.postman.com/boxdev/box-s-public-workspace/example/8119550-70a8e5bd-4d25-494c-be2c-5409db9d1ace
 */
interface OAuthBoxTokens {
    access_token: string;
    refresh_token: string;
    expires_in: number;
    token_type: 'bearer';
    restricted_to?: Array<{
        scope: string;
        object?: {
            type: string;
            id: string;
        };
    }>;
}
/**
 * Define an OAuth event handler for Box authentication.
 * @see https://developer.box.com/guides/authentication/oauth2/
 * @see https://www.postman.com/boxdev/box-s-public-workspace/collection/trhp912/box-platform-api
 */
export declare function defineOAuthBoxEventHandler({ config, onSuccess, onError }: OAuthConfig<OAuthBoxConfig, {
    user: OAuthBoxUser;
    tokens: OAuthBoxTokens;
}>): import("h3").EventHandler<import("h3").EventHandlerRequest, Promise<any>>;
export {};
