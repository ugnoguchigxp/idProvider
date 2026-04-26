package com.idp.sdk

data class BeginLoginResult(
  val authorizationUrl: String,
  val state: String,
  val nonce: String,
  val codeVerifier: String,
)

data class TokenResult(
  val accessToken: String,
  val idToken: String?,
  val refreshToken: String?,
  val expiresIn: Int,
)

class MobileKotlinSdk(
  private val issuer: String,
  private val clientId: String,
  private val redirectUri: String,
) {
  fun beginLogin(): BeginLoginResult {
    // MVP: 認可URL組み立てだけ提供（交換処理は次フェーズ）
    val state = "state-placeholder"
    val nonce = "nonce-placeholder"
    val verifier = "code-verifier-placeholder"
    val url = "$issuer/auth?client_id=$clientId&response_type=code&redirect_uri=$redirectUri&scope=openid%20profile%20email&state=$state&nonce=$nonce"
    return BeginLoginResult(url, state, nonce, verifier)
  }

  fun exchangeCode(code: String, codeVerifier: String): TokenResult {
    require(code.isNotBlank()) { "code is required" }
    require(codeVerifier.isNotBlank()) { "codeVerifier is required" }
    return TokenResult(
      accessToken = "access-token-placeholder",
      idToken = "id-token-placeholder",
      refreshToken = "refresh-token-placeholder",
      expiresIn = 300,
    )
  }
}
