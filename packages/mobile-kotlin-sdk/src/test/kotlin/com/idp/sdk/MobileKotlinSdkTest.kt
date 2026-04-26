package com.idp.sdk

import kotlin.test.Test
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
}
