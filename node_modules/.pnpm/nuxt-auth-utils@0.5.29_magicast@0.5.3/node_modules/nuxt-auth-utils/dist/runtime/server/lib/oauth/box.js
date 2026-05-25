import { eventHandler, getQuery, sendRedirect, createError } from "h3";
import { withQuery } from "ufo";
import { defu } from "defu";
import { getOAuthRedirectURL, handleAccessTokenErrorResponse, handleInvalidState, handleMissingConfiguration, handleState, requestAccessToken } from "../utils.js";
import { useRuntimeConfig } from "#imports";
export function defineOAuthBoxEventHandler({ config, onSuccess, onError }) {
  return eventHandler(async (event) => {
    config = defu(config, useRuntimeConfig(event).oauth?.box, {
      authorizationURL: "https://account.box.com/api/oauth2/authorize",
      tokenURL: "https://api.box.com/oauth2/token",
      userURL: "https://api.box.com/2.0/users/me",
      authorizationParams: {}
    });
    const query = getQuery(event);
    if (query.error) {
      const errorMessageParts = [query.error, query.error_description].filter(Boolean).join(": ");
      const error = createError({
        statusCode: 401,
        message: `Box login failed: ${errorMessageParts || "Unknown error"}`,
        data: query
      });
      if (!onError) throw error;
      return onError(event, error);
    }
    if (!config.clientId || !config.clientSecret) {
      return handleMissingConfiguration(event, "box", ["clientId", "clientSecret"], onError);
    }
    const redirectURL = config.redirectURL || getOAuthRedirectURL(event);
    const state = await handleState(event);
    if (!query.code) {
      const scope = config.scope || [];
      return sendRedirect(
        event,
        withQuery(config.authorizationURL, {
          response_type: "code",
          client_id: config.clientId,
          redirect_uri: redirectURL,
          scope: scope.join(" "),
          state,
          ...config.authorizationParams
        })
      );
    }
    if (query.state !== state) {
      return handleInvalidState(event, "box", onError);
    }
    const tokens = await requestAccessToken(config.tokenURL, {
      body: {
        grant_type: "authorization_code",
        client_id: config.clientId,
        client_secret: config.clientSecret,
        redirect_uri: redirectURL,
        code: query.code
      }
    });
    if (tokens.error) {
      return handleAccessTokenErrorResponse(event, "box", tokens, onError);
    }
    const user = await $fetch(config.userURL, {
      headers: {
        Authorization: `Bearer ${tokens.access_token}`
      }
    });
    return onSuccess(event, {
      user,
      tokens
    });
  });
}
