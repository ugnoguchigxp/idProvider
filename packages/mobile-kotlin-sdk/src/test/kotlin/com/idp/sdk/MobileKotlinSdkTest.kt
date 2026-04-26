package com.idp.sdk

import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertNull
import kotlin.test.assertTrue

class MobileKotlinSdkTest {
  @Test
  fun beginLoginReturnsAuthorizationUrl() {
    val sdk = MobileKotlinSdk(
      issuer = "https://idp.example.com",
      clientId = "mobile-client",
      redirectUri = "com.example.app:/oauth/callback",
    )

    val result = sdk.beginLogin()

    assertTrue(result.authorizationUrl.contains("response_type=code"))
    assertTrue(result.authorizationUrl.contains("client_id=mobile-client"))
  }

  @Test
  fun logoutClearsLocalTokensForLocalMode() {
    val sdk = MobileKotlinSdk(
      issuer = "https://idp.example.com",
      clientId = "mobile-client",
      redirectUri = "com.example.app:/oauth/callback",
    )
    var cleared = false

    val result = sdk.logout(
      LogoutInput(mode = LogoutMode.LOCAL, clearLocalTokens = { cleared = true }),
    )

    assertTrue(cleared)
    assertTrue(result.localTokensCleared)
    assertNull(result.logoutUrl)
  }

  @Test
  fun globalLogoutReturnsLogoutUrlAfterClearingTokens() {
    val sdk = MobileKotlinSdk(
      issuer = "https://idp.example.com/",
      clientId = "mobile-client",
      redirectUri = "com.example.app:/oauth/callback",
    )
    var cleared = false

    val result = sdk.logout(
      LogoutInput(
        mode = LogoutMode.GLOBAL,
        idTokenHint = "id-token",
        postLogoutRedirectUri = "com.example.app:/signed-out",
        state = "logout-state",
        clearLocalTokens = { cleared = true },
      ),
    )

    assertTrue(cleared)
    assertEquals(
      "https://idp.example.com/session/end?post_logout_redirect_uri=com.example.app%3A%2Fsigned-out&id_token_hint=id-token&state=logout-state",
      result.logoutUrl,
    )
  }
}
