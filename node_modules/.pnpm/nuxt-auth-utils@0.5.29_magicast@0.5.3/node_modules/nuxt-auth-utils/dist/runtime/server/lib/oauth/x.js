import { useRuntimeConfig } from "#imports";
import { defu } from "defu";
import { eventHandler, getQuery, sendRedirect } from "h3";
import { withQuery } from "ufo";
import {
  getOAuthRedirectURL,
  handleAccessTokenErrorResponse,
  handleInvalidState,
  handleMissingConfiguration,
  handlePkceVerifier,
  handleState,
  requestAccessToken
} from "../utils.js";
export function defineOAuthXEventHandler({
  config,
  onSuccess,
  onError
}) {
  return eventHandler(async (event) => {
    config = defu(config, useRuntimeConfig(event).oauth?.x, {
      authorizationURL: "https://x.com/i/oauth2/authorize",
      tokenURL: "https://api.x.com/2/oauth2/token",
      userURL: "https://api.x.com/2/users/me",
      authorizationParams: {}
    });
    const query = getQuery(event);
    if (!config.clientId || !config.clientSecret) {
      return handleMissingConfiguration(event, "x", ["clientId", "clientSecret"], onError);
    }
    const redirectURL = config.redirectURL || getOAuthRedirectURL(event);
    const pkce = await handlePkceVerifier(event);
    const state = await handleState(event);
    if (!query.code) {
      config.scope = config.scope || [
        "tweet.read",
        "users.read",
        "offline.access"
      ];
      return sendRedirect(
        event,
        withQuery(config.authorizationURL, {
          response_type: "code",
          client_id: config.clientId,
          redirect_uri: redirectURL,
          scope: config.scope.join(" "),
          ...config.authorizationParams,
          code_challenge: pkce.code_challenge,
          code_challenge_method: pkce.code_challenge_method,
          state
        })
      );
    }
    if (query.state !== state) {
      return handleInvalidState(event, "x", onError);
    }
    const tokens = await requestAccessToken(config.tokenURL, {
      headers: {
        Authorization: `Basic ${Buffer.from(
          `${config.clientId}:${config.clientSecret}`
        ).toString("base64")}`
      },
      params: {
        grant_type: "authorization_code",
        code_verifier: pkce.code_verifier,
        redirect_uri: redirectURL,
        code: query.code
      }
    });
    if (tokens.error) {
      return handleAccessTokenErrorResponse(event, "x", tokens, onError);
    }
    const accessToken = tokens.access_token;
    const user = await $fetch(config.userURL, {
      headers: {
        Authorization: `Bearer ${accessToken}`
      },
      query: {
        "user.fields": "description,id,name,profile_image_url,username,verified,verified_type"
      }
    }).catch((error) => {
      return error;
    });
    return onSuccess(event, {
      tokens,
      user: user?.data
    });
  });
}
