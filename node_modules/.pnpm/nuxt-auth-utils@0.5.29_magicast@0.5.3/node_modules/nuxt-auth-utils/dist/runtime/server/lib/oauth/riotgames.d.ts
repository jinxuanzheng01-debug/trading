import type { OAuthConfig } from '#auth-utils';
export interface OAuthRiotGamesConfig {
    /**
     * RiotGames OAuth Client ID
     * @default process.env.NUXT_OAUTH_RIOTGAMES_CLIENT_ID
     */
    clientId?: string;
    /**
     * RiotGames OAuth Client Secret
     * @default process.env.NUXT_OAUTH_RIOTGAMES_CLIENT_SECRET
     */
    clientSecret?: string;
    /**
     * RiotGames OAuth Scope
     * @default []
     * @see https://beta.developer.riotgames.com/sign-on
     * @example ['cpid', 'offline_access']
     */
    scope?: string[];
    /**
     * RiotGames OAuth Authorization URL
     * @default 'https://auth.riotgames.com/authorize'
     */
    authorizationURL?: string;
    /**
     * Riot OAuth Token URL
     * @default 'https://auth.riotgames.com/token'
     */
    tokenURL?: string;
    /**
     * RiotGames API URL
     * @default 'https://auth.riotgames.com'
     */
    apiURL?: string;
    /**
     * Extra authorization parameters to provide to the authorization URL
     */
    authorizationParams?: Record<string, string>;
    /**
     * Redirect URL to to allow overriding for situations like prod failing to determine public hostname
     * @default process.env.NUXT_OAUTH_RIOTGAMES_REDIRECT_URL
     */
    redirectURL?: string;
    /**
     * API routing values for Accounts Endpoint. You can query for any account in any region.
     * @default 'europe'
     */
    region?: 'americas' | 'europe' | 'asia';
}
interface RiotGamesUser extends RiotGamesAccount, RiotGamesUserInfo {
}
interface RiotGamesAccount {
    puuid: string;
    gameName: string;
    tagLine: string;
}
interface RiotGamesUserInfo {
    sub: string;
    cpid?: string;
    jti: string;
}
interface RiotGamesTokens {
    access_token: string;
    refresh_token: string;
    id_token: string;
    expires_in: number;
    scope: string;
    token_type: string;
}
export declare function defineOAuthRiotGamesEventHandler({ config, onSuccess, onError }: OAuthConfig<OAuthRiotGamesConfig, {
    user: RiotGamesUser;
    tokens: RiotGamesTokens;
}>): import("h3").EventHandler<import("h3").EventHandlerRequest, Promise<any>>;
export {};
