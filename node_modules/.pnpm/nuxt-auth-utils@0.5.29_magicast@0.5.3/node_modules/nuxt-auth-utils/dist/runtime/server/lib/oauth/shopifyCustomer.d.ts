import type { OAuthConfig } from '#auth-utils';
export interface OAuthShopifyCustomerConfig {
    /**
     * Shopify shop domain ID
     * @default process.env.NUXT_OAUTH_SHOPIFY_CUSTOMER_SHOP_DOMAIN
     * @example 123.myshopify.com
     */
    shopDomain?: string;
    /**
     * Shopify Customer Client ID
     * @default process.env.NUXT_OAUTH_SHOPIFY_CUSTOMER_CLIENT_ID
     */
    clientId?: string;
    /**
     * Shopify Customer OAuth Scope
     * @default ['openid', 'email', 'customer-account-api:full']
     * @example ['openid', 'email', 'customer-account-api:full']
     */
    scope?: string[];
    /**
     * Redirect URL to to allow overriding for situations like prod failing to determine public hostname
     * @default process.env.NUXT_OAUTH_SHOPIFY_CUSTOMER_REDIRECT_URL or current URL
     */
    redirectURL?: string;
}
export declare function defineOAuthShopifyCustomerEventHandler({ config, onSuccess, onError, }: OAuthConfig<OAuthShopifyCustomerConfig>): import("h3").EventHandler<import("h3").EventHandlerRequest, Promise<any>>;
