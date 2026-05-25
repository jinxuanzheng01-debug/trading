import { createError, eventHandler, getQuery, sendRedirect } from "h3";
import { withQuery } from "ufo";
import { defu } from "defu";
import { getOAuthRedirectURL, handleAccessTokenErrorResponse, handleMissingConfiguration, handlePkceVerifier, handleState, requestAccessToken } from "../utils.js";
import { useRuntimeConfig } from "#imports";
export function defineOAuthShopifyCustomerEventHandler({
  config,
  onSuccess,
  onError
}) {
  return eventHandler(async (event) => {
    config = defu(config, useRuntimeConfig(event).oauth?.shopifyCustomer, {});
    const query = getQuery(event);
    if (!config.clientId || !config.shopDomain) {
      return handleMissingConfiguration(event, "spotify", ["clientId", "shopDomain"], onError);
    }
    const verifier = await handlePkceVerifier(event);
    const redirectURL = config.redirectURL || getOAuthRedirectURL(event);
    const discoveryResponse = await $fetch(`https://${config.shopDomain}/.well-known/openid-configuration`).then((d) => d).catch(() => null);
    if (!discoveryResponse?.issuer) {
      const error = createError({
        statusCode: 400,
        message: "Getting Shopify discovery endpoint failed."
      });
      if (!onError) throw error;
      return onError(event, error);
    }
    const state = await handleState(event);
    if (!query.code) {
      config.scope = config.scope && config.scope.length > 0 ? config.scope : ["openid", "email", "customer-account-api:full"];
      config.scope = [...new Set(config.scope)];
      return sendRedirect(
        event,
        withQuery(discoveryResponse.authorization_endpoint, {
          response_type: "code",
          client_id: config.clientId,
          redirect_uri: redirectURL,
          scope: config.scope.join(" "),
          state,
          code_challenge: verifier.code_challenge,
          code_challenge_method: verifier.code_challenge_method
        })
      );
    }
    const tokens = await requestAccessToken(discoveryResponse.token_endpoint, {
      body: {
        grant_type: "authorization_code",
        client_id: config.clientId,
        redirect_uri: redirectURL,
        code: query.code,
        code_verifier: verifier.code_verifier
      }
    }).catch(() => ({ error: "failed" }));
    if (tokens.error) {
      return handleAccessTokenErrorResponse(event, "shopifyCustomer", tokens, onError);
    }
    const apiDiscoveryUrl = await $fetch(`https://${config.shopDomain}/.well-known/customer-account-api`).then((d) => d).catch(() => null);
    if (!apiDiscoveryUrl?.graphql_api) {
      const error = createError({
        statusCode: 400,
        message: "Getting Shopify api endpoints failed."
      });
      if (!onError) throw error;
      return onError(event, error);
    }
    const user = await $fetch(apiDiscoveryUrl.graphql_api, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": tokens.access_token
      },
      body: JSON.stringify({
        operationName: "getCustomer",
        query: "query { customer { firstName lastName emailAddress { emailAddress }}}"
      })
    }).then((d) => d.data).catch(() => null);
    if (!user || !user.customer) {
      const error = createError({
        statusCode: 400,
        message: "Getting Shopify Customer failed."
      });
      if (!onError) throw error;
      return onError(event, error);
    }
    return onSuccess(event, {
      tokens,
      user: user.customer
    });
  });
}
