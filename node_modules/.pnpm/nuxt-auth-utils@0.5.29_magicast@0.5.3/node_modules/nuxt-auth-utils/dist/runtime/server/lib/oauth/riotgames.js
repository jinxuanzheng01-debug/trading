import { createError, eventHandler, getQuery, sendRedirect } from "h3";
import { withQuery } from "ufo";
import { defu } from "defu";
import { getOAuthRedirectURL, handleAccessTokenErrorResponse, handleInvalidState, handleMissingConfiguration, handleState, requestAccessToken } from "../utils.js";
import { useRuntimeConfig } from "#imports";
export function defineOAuthRiotGamesEventHandler({ config, onSuccess, onError }) {
  return eventHandler(async (event) => {
    config = defu(config, useRuntimeConfig(event).oauth?.riotgames, {
      authorizationURL: "https://auth.riotgames.com/authorize",
      tokenURL: "https://auth.riotgames.com/token",
      apiURL: "https://auth.riotgames.com",
      region: "europe"
    });
    const query = getQuery(event);
    if (query.error) {
      const error = createError({
        statusCode: 401,
        message: `RiotGames login failed: ${query.error || "Unknown error"}`,
        data: query
      });
      if (!onError) throw error;
      return onError(event, error);
    }
    if (!config.clientId || !config.clientSecret) {
      return handleMissingConfiguration(event, "riotgames", ["clientId", "clientSecret"], onError);
    }
    const redirectURL = config.redirectURL || getOAuthRedirectURL(event);
    const state = await handleState(event);
    if (!query.code) {
      config.scope = config.scope || [];
      if (!config.scope.includes("openid")) {
        config.scope.push("openid");
      }
      return sendRedirect(
        event,
        withQuery(config.authorizationURL, {
          client_id: config.clientId,
          redirect_uri: redirectURL,
          response_type: "code",
          scope: config.scope.join(" "),
          state,
          ...config.authorizationParams
        })
      );
    }
    if (query.state !== state) {
      return handleInvalidState(event, "riotgames", onError);
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
      return handleAccessTokenErrorResponse(event, "riotgames", tokens, onError);
    }
    const accessToken = tokens.access_token;
    const [account, userInfo] = await Promise.all([
      $fetch(`https://${config.region}.api.riotgames.com/riot/account/v1/accounts/me`, {
        headers: {
          Authorization: `Bearer ${accessToken}`
        }
      }),
      $fetch(`${config.apiURL}/userinfo`, {
        headers: {
          Authorization: `Bearer ${accessToken}`
        }
      })
    ]);
    const user = {
      ...account,
      ...userInfo
    };
    return onSuccess(event, {
      user,
      tokens
    });
  });
}
