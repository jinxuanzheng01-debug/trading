import { useRuntimeConfig } from "#imports";
import { defu } from "defu";
import { createError, eventHandler, getQuery, sendRedirect } from "h3";
import { withQuery } from "ufo";
import { getOAuthRedirectURL, handleAccessTokenErrorResponse, handleInvalidState, handleMissingConfiguration, handlePkceVerifier, handleState, requestAccessToken, handleNonce, parseJwt } from "../utils.js";
export function defineOAuthOidcEventHandler({ config, onSuccess, onError }) {
  return eventHandler(async (event) => {
    config = defu(config, useRuntimeConfig(event).oauth.oidc, {
      scope: ["openid"]
    });
    const query = getQuery(event);
    if (query.error) {
      const error = createError({
        statusCode: 401,
        message: `OIDC login failed: ${query.error || "Unknown error"}`,
        data: query
      });
      if (!onError) throw error;
      return onError(event, error);
    }
    if (!config.clientId || !config.openidConfig) {
      return handleMissingConfiguration(event, "oidc", ["clientId", "openidConfig"], onError);
    }
    const oidcConfig = typeof config.openidConfig === "string" ? await $fetch(config.openidConfig) : config.openidConfig;
    const redirectURL = config.redirectURL || getOAuthRedirectURL(event);
    const state = await handleState(event);
    const verifier = await handlePkceVerifier(event);
    const nonce = handleNonce(event);
    if (!query.code) {
      config.scope = config.scope || [];
      const authQuery = {
        client_id: config.clientId,
        redirect_uri: redirectURL,
        scope: config.scope.join(" "),
        state,
        nonce,
        response_type: "code",
        ...config.params?.authorization_endpoint
      };
      authQuery.code_challenge = verifier.code_challenge;
      authQuery.code_challenge_method = verifier.code_challenge_method;
      return sendRedirect(
        event,
        withQuery(oidcConfig.authorization_endpoint, authQuery)
      );
    }
    if (query.state !== state) {
      return handleInvalidState(event, "oidc", onError);
    }
    const tokenQuery = {
      grant_type: "authorization_code",
      client_id: config.clientId,
      client_secret: config.clientSecret,
      redirect_uri: redirectURL,
      code: query.code,
      code_verifier: verifier.code_verifier,
      ...config.params?.token_endpoint
    };
    const tokens = await requestAccessToken(oidcConfig.token_endpoint, {
      body: tokenQuery
    });
    if (tokens.error) {
      return handleAccessTokenErrorResponse(event, "oidc", tokens, onError);
    }
    if (tokens.id_token) {
      const claims = parseJwt(tokens.id_token);
      if (claims.nonce !== nonce) {
        const error = createError({
          statusCode: 401,
          message: "OIDC login failed: nonce mismatch"
        });
        if (!onError) throw error;
        return onError(event, error);
      }
    }
    let user = {};
    if (oidcConfig.userinfo_endpoint) {
      user = await $fetch(oidcConfig.userinfo_endpoint, {
        headers: {
          Authorization: `${tokens.token_type} ${tokens.access_token}`
        },
        params: {
          ...config.params?.userinfo_endpoint
        }
      });
    }
    return onSuccess(event, {
      user,
      tokens
    });
  });
}
